import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState, Song } from '../../types'
import {
  isSongRow,
  mergePrefs,
  mergeSongs,
  prefsFromState,
  songTime,
  type PrefsDoc,
  type RemotePrefs,
  type RemoteSong,
} from './sync'

export type SyncMode = 'full' | 'push'
export type SyncStatus = 'syncing' | 'synced' | 'error' | 'offline'

export const POLL_MS = 45_000
export const PUSH_DEBOUNCE_MS = 1400
const RETRY_MS = 600
/** How many times a rejected push may be retried before it is reported. */
const MAX_RETRIES = 3
/** Overlap on incremental reads, so a clock a second behind cannot skip a row. */
const PULL_OVERLAP_MS = 1000

const OFFLINE_MESSAGE = 'Could not reach the cloud. Your work is still saved here.'

export interface SyncDeps {
  getClient: () => SupabaseClient | null
  getUserId: () => string | null
  isSignedIn: () => boolean
  getState: () => AppState
  apply: (patch: Partial<AppState>) => void
  onStatus: (status: SyncStatus) => void
  onSynced: (at: number) => void
  onError: (message: string | null) => void
  online?: () => boolean
  now?: () => number
  retry?: (run: () => unknown, ms: number) => void
}

export interface SyncEngine {
  sync: (mode: SyncMode) => Promise<void>
  /** Full read from the top: for rows that appeared without being newer (a shared song). */
  refresh: () => Promise<void>
  reset: () => void
  /** True once a full pass has read the cloud; a push before that could clobber it. */
  isReady: () => boolean
}

export function messageOf(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error) return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

/** Cloud prefs folded into app state, keeping whatever the doc leaves out. */
export function prefsPatch(current: AppState, doc: Partial<PrefsDoc>): Partial<AppState> {
  return {
    settings: { ...current.settings, ...(doc.settings ?? {}) },
    folders: doc.folders?.length ? doc.folders : current.folders,
    vault: Array.isArray(doc.vault) ? doc.vault : current.vault,
    lexicon:
      doc.lexicon && typeof doc.lexicon === 'object' ? doc.lexicon : current.lexicon,
    lexiconAt: doc.lexiconAt ?? current.lexiconAt,
    removedVault: doc.removedVault ?? current.removedVault,
    removedLexicon: doc.removedLexicon ?? current.removedLexicon,
  }
}

class RejectedPush extends Error {
  readonly song: Song
  constructor(song: Song) {
    super(`push_song rejected ${song.id}`)
    this.song = song
  }
}

/**
 * Mirrors the local library into Postgres and back, with no React in sight so the
 * sequencing can be tested against a fake client.
 *
 * Rules the tests pin down:
 *   * nothing here deletes a cloud row — pruges travel as tombstones in the doc;
 *   * a push never runs before a full pass has read the cloud;
 *   * a push the server refuses is retried a few times, then reported instead of
 *     being retried forever behind a "Synced" label.
 */
export function createSyncEngine(deps: SyncDeps): SyncEngine {
  /** Revision + updatedAt of the cloud copy this device last saw. */
  const mirror = new Map<string, { revision: number; updatedAt: number }>()
  const prefsMirror: { current: { json: string; updatedAt: string } | null } = { current: null }
  /** High-water mark for incremental pulls: only newer rows are read again. */
  let since: string | null = null
  let ready = false
  let running = false
  let again = false
  let retries = 0

  const now = deps.now ?? (() => Date.now())
  const retry =
    deps.retry ??
    ((run: () => void, ms: number) => {
      window.setTimeout(run, ms)
    })
  const isOnline = deps.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false)

  const reset = () => {
    mirror.clear()
    prefsMirror.current = null
    since = null
    ready = false
    running = false
    again = false
    retries = 0
  }

  async function pushSong(supabase: SupabaseClient, song: Song): Promise<boolean> {
    const known = mirror.get(song.id)
    const { data, error } = await supabase.rpc('push_song', {
      p_doc: song,
      p_expected: known ? known.revision : null,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as { revision: number } | null
    // No row back means someone else moved this song on: pull before writing.
    if (!row) return false
    mirror.set(song.id, { revision: Number(row.revision), updatedAt: songTime(song) })
    return true
  }

  async function pushPrefs(supabase: SupabaseClient, prefs: PrefsDoc) {
    const userId = deps.getUserId()
    if (!userId) return
    const { data, error } = await supabase
      .from('user_prefs')
      .upsert({ user_id: userId, doc: prefs }, { onConflict: 'user_id' })
      .select('updated_at')
      .maybeSingle()
    if (error) throw error
    const updatedAt =
      (data as { updated_at?: string } | null)?.updated_at ?? new Date(now()).toISOString()
    prefsMirror.current = { json: JSON.stringify(prefs), updatedAt }
  }

  async function readRemote(supabase: SupabaseClient) {
    const columns = 'id, revision, doc, updated_at'
    const songsQuery = supabase.from('songs').select(columns)
    // After the first pass only rows that moved since are worth downloading.
    const songs = since ? await songsQuery.gt('updated_at', since) : await songsQuery
    const prefs = await supabase.from('user_prefs').select('doc, updated_at').maybeSingle()
    if (songs.error) throw songs.error
    if (prefs.error) throw prefs.error

    const rows = ((songs.data ?? []) as unknown[]).filter(isSongRow) as RemoteSong[]
    const prefsRow = prefs.data as RemotePrefs | null

    let latest = 0
    for (const row of rows) latest = Math.max(latest, Date.parse(row.updated_at) || 0)
    if (prefsRow?.updated_at) latest = Math.max(latest, Date.parse(prefsRow.updated_at) || 0)
    if (latest) since = new Date(latest - PULL_OVERLAP_MS).toISOString()

    return { rows, prefs: prefsRow }
  }

  /**
   * `undefined` means this pass has not read the cloud and only sends local
   * changes. Lists (vault, lexicon, folders) always merge; settings are the one
   * last-write-wins field, so the cloud only wins when it is the side that moved.
   */
  async function syncPrefs(supabase: SupabaseClient, remotePrefs: RemotePrefs | null | undefined) {
    const local = prefsFromState(deps.getState())
    const localJson = JSON.stringify(local)

    if (remotePrefs === undefined) {
      if (prefsMirror.current?.json !== localJson) await pushPrefs(supabase, local)
      return
    }
    if (!remotePrefs) {
      await pushPrefs(supabase, local)
      return
    }

    const remoteDoc = remotePrefs.doc ?? {}
    const remoteJson = JSON.stringify(remoteDoc)
    const localMoved = prefsMirror.current ? localJson !== prefsMirror.current.json : false
    const cloudMoved = remotePrefs.updated_at !== prefsMirror.current?.updatedAt
    const cloudWins = cloudMoved && !localMoved
    const merged = mergePrefs(local, cloudWins ? remoteDoc : { ...remoteDoc, settings: undefined })
    const mergedJson = JSON.stringify(merged)

    if (mergedJson !== localJson) deps.apply(prefsPatch(deps.getState(), merged))
    if (mergedJson !== remoteJson) await pushPrefs(supabase, merged)
    else prefsMirror.current = { json: remoteJson, updatedAt: remotePrefs.updated_at }
  }

  const sync = async (mode: SyncMode) => {
    const supabase = deps.getClient()
    const songs = deps.getState().songs
    if (!supabase || !deps.getUserId() || !deps.isSignedIn()) return
    if (mode === 'push' && !ready) return
    if (running) {
      again = true
      return
    }

    let toPush: Song[] = []

    if (mode === 'push') {
      toPush = songs.filter((song) => {
        const known = mirror.get(song.id)
        return !known || songTime(song) > known.updatedAt
      })
      const prefsDirty =
        prefsMirror.current?.json !== JSON.stringify(prefsFromState(deps.getState()))
      // Typing that is already mirrored costs nothing and shows nothing.
      if (!toPush.length && !prefsDirty) return
    }

    running = true
    deps.onStatus('syncing')
    let rejected: Song | null = null

    try {
      let remotePrefs: RemotePrefs | null | undefined

      if (mode === 'full') {
        const remote = await readRemote(supabase)
        const plan = mergeSongs(songs, remote.rows)
        // Fold what the cloud has into the mirror. Later passes read incrementally,
        // so entries for untouched rows must survive this loop.
        for (const row of remote.rows) {
          mirror.set(row.doc.id, {
            revision: Number(row.revision),
            updatedAt: songTime(row.doc),
          })
        }
        ready = true
        if (plan.pulled.length) deps.apply({ songs: plan.songs })
        // An incremental read cannot see unchanged rows, so `plan.push` contains
        // most of the library. Only send what actually moved since we last saw it.
        toPush = plan.push.filter((song) => {
          const known = mirror.get(song.id)
          return !known || songTime(song) > known.updatedAt
        })
        remotePrefs = remote.prefs
      }

      for (const song of toPush) {
        if (await pushSong(supabase, song)) continue
        throw new RejectedPush(song)
      }

      await syncPrefs(supabase, remotePrefs)

      retries = 0
      deps.onStatus('synced')
      deps.onError(null)
      deps.onSynced(now())
    } catch (err) {
      if (err instanceof RejectedPush) {
        rejected = err.song
        // Another device moved it. The next pass reads first and tries again, but
        // only a few times: a write the server keeps refusing is a real problem.
        if (retries >= MAX_RETRIES) {
          deps.onError(
            `Couldn’t save “${err.song.title}” to your account. It is still safe on this device.`,
          )
          deps.onStatus(isOnline() ? 'error' : 'offline')
        } else {
          again = true
        }
      } else {
        deps.onError(messageOf(err, OFFLINE_MESSAGE))
        deps.onStatus(isOnline() ? 'error' : 'offline')
        again = false
      }
    } finally {
      running = false
      if (again) {
        again = false
        retries += 1
        if (retries <= MAX_RETRIES) {
          retry(() => sync('full'), RETRY_MS)
        } else if (rejected) {
          deps.onError(
            `Couldn’t save “${rejected.title}” to your account. It is still safe on this device.`,
          )
          deps.onStatus(isOnline() ? 'error' : 'offline')
        }
      }
    }
  }

  /**
   * Drops the incremental high-water mark and reads everything. An invite can add
   * a row older than this device's last sync, which the incremental read skips.
   */
  const refresh = async () => {
    since = null
    await sync('full')
  }

  return { sync, refresh, reset, isReady: () => ready }
}
