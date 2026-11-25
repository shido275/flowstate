import type { AppState, Snippet, Settings, Song } from '../../types'

/** The shape of a row in public.songs as the client reads it. */
export interface RemoteSong {
  id: string
  revision: number
  doc: Song
  updated_at: string
}

/**
 * Settings, folders, snippet vault and taught pronunciations, per user.
 *
 * The vault and the lexicon are additive, so a removal cannot be expressed by
 * simply leaving the item out — the other device would merge it straight back.
 * Both therefore carry tombstones: `removedVault`/`removedLexicon` map an id (or
 * a word) to the moment it was removed, and `lexiconAt` records when each taught
 * word was last set, so teaching a word again after removing it still wins.
 */
export interface PrefsDoc {
  settings: Settings
  folders: string[]
  vault: Snippet[]
  lexicon: Record<string, string>
  lexiconAt?: Record<string, number>
  removedVault?: Record<string, number>
  removedLexicon?: Record<string, number>
}

export interface RemotePrefs {
  doc: Partial<PrefsDoc>
  updated_at: string
}

export interface MergeResult {
  /** The merged library: newest version of every song, newest first. */
  songs: Song[]
  /** Songs this device knows better than the cloud, to push up. */
  push: Song[]
  /** Ids whose cloud copy was newer and is now part of `songs`. */
  pulled: string[]
}

/** A song's own clock. Local ids keep `updatedAt`, so it survives every round trip. */
export const songTime = (song: Song): number => song.updatedAt || song.createdAt || 0

export function isSongRow(row: unknown): row is RemoteSong {
  const candidate = row as RemoteSong | null
  return Boolean(
    candidate &&
      candidate.doc &&
      typeof candidate.doc.id === 'string' &&
      Array.isArray(candidate.doc.sections),
  )
}

/**
 * Per-song merge. Identity is the song id; within one id, the newer `updatedAt`
 * wins and ties go to the cloud so two devices cannot ping-pong forever.
 * Deletions and purges travel as tombstones inside the doc, so a newer tombstone
 * wins like any other edit and nobody can resurrect the song by accident.
 */
export function mergeSongs(localSongs: Song[], remoteRows: RemoteSong[]): MergeResult {
  const localById = new Map<string, Song>()
  for (const song of localSongs) localById.set(song.id, song)

  // Defensive: if the same id ever appears twice, the higher revision wins.
  const remoteById = new Map<string, RemoteSong>()
  for (const row of remoteRows) {
    if (!isSongRow(row)) continue
    const known = remoteById.get(row.doc.id)
    if (!known || Number(row.revision) > Number(known.revision)) remoteById.set(row.doc.id, row)
  }

  const songs: Song[] = []
  const push: Song[] = []
  const pulled: string[] = []

  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const mine = localById.get(id)
    const theirs = remoteById.get(id)?.doc
    if (mine && theirs) {
      if (songTime(mine) > songTime(theirs)) {
        songs.push(mine)
        push.push(mine)
      } else {
        songs.push(theirs)
        if (JSON.stringify(theirs) !== JSON.stringify(mine)) pulled.push(id)
      }
      continue
    }
    if (mine) {
      songs.push(mine)
      push.push(mine)
    } else if (theirs) {
      songs.push(theirs)
      pulled.push(id)
    }
  }

  songs.sort((a, b) => songTime(b) - songTime(a))
  return { songs, push, pulled }
}

export function prefsFromState(state: AppState): PrefsDoc {
  return {
    settings: state.settings,
    folders: state.folders,
    vault: state.vault,
    lexicon: state.lexicon,
    lexiconAt: state.lexiconAt ?? {},
    removedVault: state.removedVault ?? {},
    removedLexicon: state.removedLexicon ?? {},
  }
}

const VAULT_LIMIT = 300

function dedupeSnippets(snippets: Snippet[]): Snippet[] {
  const seen = new Map<string, Snippet>()
  for (const snippet of snippets) {
    if (!snippet || typeof snippet.id !== 'string') continue
    if (!seen.has(snippet.id)) seen.set(snippet.id, snippet)
  }
  return Array.from(seen.values()).sort((a, b) => b.createdAt - a.createdAt)
}

function mergeTombstones(
  local: Record<string, number> = {},
  remote: Record<string, number> = {},
): Record<string, number> {
  const merged: Record<string, number> = { ...local }
  for (const [key, at] of Object.entries(remote)) {
    if (typeof at !== 'number') continue
    merged[key] = Math.max(merged[key] ?? 0, at)
  }
  return merged
}

/**
 * Prefs merge keeps everything that was not removed: folders, the snippet vault
 * and taught pronunciations are additive, so pulling a second device's copy
 * never costs you lines. Settings are the one last-write-wins field, and the
 * cloud copy wins on a pull. Removals win over items unless the item was set
 * again afterwards.
 */
export function mergePrefs(local: PrefsDoc, remote: Partial<PrefsDoc>): PrefsDoc {
  const removedVault = mergeTombstones(local.removedVault, remote.removedVault)
  const removedLexicon = mergeTombstones(local.removedLexicon, remote.removedLexicon)

  const vaultKept = dedupeSnippets([...(local.vault ?? []), ...(remote.vault ?? [])]).filter(
    (snippet) => !(snippet.id in removedVault),
  )
  const vault = vaultKept.slice(0, VAULT_LIMIT)
  // Anything that falls off the end is tombstoned, or the other device would
  // import it again on its next pull and we would churn forever.
  for (const dropped of vaultKept.slice(VAULT_LIMIT)) {
    removedVault[dropped.id] = dropped.createdAt
  }

  const localLexicon = local.lexicon ?? {}
  const remoteLexicon = remote.lexicon ?? {}
  const localAt = local.lexiconAt ?? {}
  const remoteAt = remote.lexiconAt ?? {}
  const lexicon: Record<string, string> = {}
  const lexiconAt: Record<string, number> = {}

  for (const word of new Set([...Object.keys(localLexicon), ...Object.keys(remoteLexicon)])) {
    const localStamp = localAt[word] ?? 0
    const remoteStamp = remoteAt[word] ?? 0
    const inLocal = word in localLexicon
    const inRemote = word in remoteLexicon
    // Ties go to this device: teaching a word here is the more recent intent.
    const fromLocal = inLocal && (localStamp >= remoteStamp || !inRemote)
    const value = fromLocal ? localLexicon[word] : remoteLexicon[word]
    const at = Math.max(localStamp, remoteStamp, value === undefined ? 0 : 1)
    const removedAt = Math.max(removedLexicon[word] ?? 0, 0)
    if (value !== undefined && at > removedAt) {
      lexicon[word] = value
      lexiconAt[word] = at
    }
  }

  return {
    settings: { ...local.settings, ...(remote.settings ?? {}) },
    folders: Array.from(new Set([...(remote.folders ?? []), ...local.folders])),
    vault,
    lexicon,
    lexiconAt,
    removedVault,
    removedLexicon,
  }
}
