import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, Line, Section, Settings, Song, Take, Vibe } from './types'
import { blankLine, newSong, streakCount, uid } from './types'
import {
  STATE_KEY,
  deleteTakeBlob,
  deviceId,
  getTakeBlob,
  loadState,
  parseState,
  putTakeBlob,
  recordWritingDay,
  saveState,
} from './lib/storage'
import {
  deleteVersionsFor,
  saveVersion,
  sectionsFromVersion,
  type SongVersion,
} from './lib/versions'
import { setUserLexicon } from './lib/engine'
import { downloadBackup, parseBackup } from './lib/export'
import { songTime } from './lib/cloud/sync'
import { useCloudSync } from './lib/cloud/useCloudSync'
import Home from './components/Home'
import Editor from './components/Editor'

type Route = { name: 'home' } | { name: 'song'; id: string }

/** What one undo step remembers. Settings and streaks are not part of it. */
interface LibrarySnapshot {
  songs: Song[]
  folders: string[]
}

const UNDO_BURST_MS = 700
const HISTORY_LIMIT = 80

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '')
  const match = hash.match(/^\/song\/(.+)$/)
  return match ? { name: 'song', id: decodeURIComponent(match[1]) } : { name: 'home' }
}

function navigate(route: Route) {
  window.location.hash = route.name === 'home' ? '/' : `/song/${encodeURIComponent(route.id)}`
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [route, setRoute] = useState<Route>(() => parseRoute())
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved')
  const [toast, setToast] = useState<string | null>(null)
  const [conflict, setConflict] = useState<AppState | null>(null)
  /** A song accepted from an invite link, waiting for the sync that brings it. */
  const [pendingSong, setPendingSong] = useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  const toastTimer = useRef<number | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  /* ------------------------------ undo history ----------------------------- */

  const historyRef = useRef<{ past: LibrarySnapshot[]; future: LibrarySnapshot[] }>({
    past: [],
    future: [],
  })
  const prevStateRef = useRef(state)
  const lastEditRef = useRef(0)
  const skipHistoryRef = useRef(false)
  const saveErrorNotified = useRef(false)

  useEffect(() => {
    const previous = prevStateRef.current
    prevStateRef.current = state
    if (previous === state) return
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false
      return
    }
    if (previous.songs === state.songs && previous.folders === state.folders) return
    const now = Date.now()
    const history = historyRef.current
    // A burst of typing is one undo step, so undo never takes you letter by letter.
    if (now - lastEditRef.current > UNDO_BURST_MS) {
      history.past.push({ songs: previous.songs, folders: previous.folders })
      if (history.past.length > HISTORY_LIMIT) history.past.shift()
      history.future = []
    }
    lastEditRef.current = now
    setHistoryVersion((n) => n + 1)
  }, [state])

  const applySnapshot = useCallback((snapshot: LibrarySnapshot) => {
    stateRef.current = { ...stateRef.current, songs: snapshot.songs, folders: snapshot.folders }
    setState((prev) => ({ ...prev, songs: snapshot.songs, folders: snapshot.folders }))
  }, [])

  const undo = useCallback(() => {
    const history = historyRef.current
    const snapshot = history.past.pop()
    if (!snapshot) return
    const current = stateRef.current
    history.future.unshift({ songs: current.songs, folders: current.folders })
    if (history.future.length > HISTORY_LIMIT) history.future.pop()
    skipHistoryRef.current = true
    lastEditRef.current = 0
    applySnapshot(snapshot)
    setHistoryVersion((n) => n + 1)
    setToast('Undid the last change')
  }, [applySnapshot])

  const redo = useCallback(() => {
    const history = historyRef.current
    const snapshot = history.future.shift()
    if (!snapshot) return
    const current = stateRef.current
    history.past.push({ songs: current.songs, folders: current.folders })
    if (history.past.length > HISTORY_LIMIT) history.past.shift()
    skipHistoryRef.current = true
    lastEditRef.current = 0
    applySnapshot(snapshot)
    setHistoryVersion((n) => n + 1)
    setToast('Redid that change')
  }, [applySnapshot])

  // historyVersion only exists to re-render the undo buttons.
  void historyVersion
  const canUndo = historyRef.current.past.length > 0
  const canRedo = historyRef.current.future.length > 0

  /* -------------------------------- cloud sync ------------------------------ */

  /** Audio and version history are per device, so a purge takes them with it. */
  const sweepSongFiles = useCallback((song: Song) => {
    song.sections.forEach((section) =>
      section.lines.forEach((line) => line.takes.forEach((take) => void deleteTakeBlob(take.id))),
    )
    song.takes.forEach((take) => void deleteTakeBlob(take.id))
    deleteVersionsFor([song.id])
  }, [])

  const applyRemote = useCallback(
    (patch: Partial<AppState>) => {
      // A pull from the cloud is not an edit, so it stays out of the undo stack.
      if (patch.songs) {
        skipHistoryRef.current = true
        const before = new Map(stateRef.current.songs.map((song) => [song.id, song]))
        for (const next of patch.songs) {
          const previous = before.get(next.id)
          if (!previous) continue
          // The cloud's copy wins this song: keep the version being replaced in
          // the history, so a merge never silently eats an edit.
          if (
            songTime(next) >= songTime(previous) &&
            JSON.stringify(next) !== JSON.stringify(previous)
          ) {
            saveVersion(previous, false)
          }
          // Erased for good somewhere else: the audio here goes too.
          if (!previous.purgedAt && next.purgedAt) sweepSongFiles(previous)
        }
      }
      setState((prev) => ({ ...prev, ...patch }))
    },
    [sweepSongFiles],
  )

  const cloud = useCloudSync(state, applyRemote)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  /* -------------------------------- routing -------------------------------- */

  useEffect(() => {
    const onHash = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.history.replaceState(null, '', '#/')
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  /* --------------------------------- saving -------------------------------- */

  useEffect(() => {
    // While another tab holds newer work, hold this tab's writes so neither
    // side silently overwrites the other.
    if (conflict) return
    setSaveStatus('saving')
    const t = window.setTimeout(() => {
      const ok = saveState(state)
      setSaveStatus(ok ? 'saved' : 'error')
      if (!ok && !saveErrorNotified.current) {
        saveErrorNotified.current = true
        setToast('Could not save — browser storage is full. Export a backup.')
      }
      if (ok) saveErrorNotified.current = false
    }, 320)
    return () => window.clearTimeout(t)
  }, [state, conflict])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STATE_KEY || !event.newValue) return
      const remote = parseState(event.newValue)
      if (!remote) return
      const mine = stateRef.current
      if (JSON.stringify(remote.songs) === JSON.stringify(mine.songs)) return
      setConflict(remote)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const loadRemote = useCallback(() => {
    if (!conflict) return
    skipHistoryRef.current = false
    setState(conflict)
    setConflict(null)
    setToast('Loaded the other tab’s version')
  }, [conflict])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  const resolvedTheme =
    state.settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : state.settings.theme

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', resolvedTheme === 'dark' ? '#17171c' : '#f8f4ed')
  }, [resolvedTheme])

  useEffect(() => {
    const song =
      route.name === 'song' ? state.songs.find((s) => s.id === route.id && !s.purgedAt) : null
    document.title = song ? `${song.title} — Flowstate` : 'Flowstate — a calm place to write'
  }, [route, state.songs])

  useEffect(() => {
    setUserLexicon(state.lexicon)
  }, [state.lexicon])

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  /** Redeem ?invite=<token> once there is a session to redeem it with. */
  const inviteHandled = useRef(false)
  useEffect(() => {
    if (inviteHandled.current || cloud.stage !== 'signed-in' || cloud.otherAccount) return
    const token = new URLSearchParams(window.location.search).get('invite')
    if (!token) return
    inviteHandled.current = true
    void (async () => {
      try {
        const joined = await cloud.sharing.accept(token)
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
        if (!joined) {
          notify('That invite link has expired or was already used.')
          return
        }
        // The song lives in the cloud first; wait for the pull that brings it in.
        setPendingSong(joined.songId)
        await cloud.syncNow()
        notify(`Opened “${joined.title}”`)
      } catch (err) {
        notify(err instanceof Error ? err.message : 'That invite link did not work.')
      }
    })()
  }, [cloud.stage, cloud.otherAccount, cloud.sharing, cloud.syncNow, notify])

  useEffect(() => {
    if (!pendingSong) return
    if (state.songs.some((song) => song.id === pendingSong && !song.purgedAt)) {
      navigate({ name: 'song', id: pendingSong })
      setPendingSong(null)
    }
  }, [pendingSong, state.songs])

  useEffect(() => {
    if (!pendingSong) return
    const timer = window.setTimeout(() => {
      setPendingSong(null)
      notify('The shared song is still syncing — it will appear in your library shortly.')
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [pendingSong, notify])

  /* -------------------------------- song CRUD ------------------------------- */

  const mutateSong = useCallback((id: string, fn: (song: Song) => Song) => {
    setState((prev) =>
      recordWritingDay({
        ...prev,
        songs: prev.songs.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)),
      }),
    )
  }, [])

  const updateSong = useCallback(
    (song: Song) => mutateSong(song.id, () => song),
    [mutateSong],
  )

  const createSong = useCallback(
    (opts: { title: string; folder: string; vibe: Vibe; bpm: number }) => {
      const song = newSong({
        title: opts.title.trim() || 'Untitled song',
        folder: opts.folder || 'Drafts',
        vibe: opts.vibe,
        bpm: opts.bpm,
        beatStyle: stateRef.current.settings.beatStyle,
        sections: [
          {
            id: uid(),
            kind: 'verse',
            title: 'Verse 1',
            target: 12,
            lines: [blankLine(), blankLine(), blankLine(), blankLine()],
          },
          {
            id: uid(),
            kind: 'hook',
            title: 'Hook',
            target: 10,
            lines: [blankLine(), blankLine(), blankLine(), blankLine()],
          },
        ],
      })
      setState((prev) => ({
        ...prev,
        songs: [song, ...prev.songs],
        folders: prev.folders.includes(song.folder) ? prev.folders : [...prev.folders, song.folder],
      }))
      navigate({ name: 'song', id: song.id })
      notify('Song created')
    },
    [notify],
  )

  const deleteSong = useCallback(
    (id: string) => {
      mutateSong(id, (s) => ({ ...s, deletedAt: Date.now() }))
      if (route.name === 'song' && route.id === id) navigate({ name: 'home' })
      notify('Moved to trash')
    },
    [mutateSong, notify, route],
  )

  const restoreSong = useCallback(
    (id: string) => {
      mutateSong(id, (s) => {
        const next = { ...s }
        delete next.deletedAt
        return next
      })
      notify('Restored')
    },
    [mutateSong, notify],
  )

  const purgeSong = useCallback(
    (id: string) => {
      const song = stateRef.current.songs.find((s) => s.id === id)
      if (song) sweepSongFiles(song)
      // A purge is a tombstone, not a disappearance: the row stays in the cloud
      // so another device cannot upload the song again.
      mutateSong(id, (s) => ({ ...s, purgedAt: Date.now() }))
      notify('Deleted forever')
    },
    [mutateSong, notify, sweepSongFiles],
  )

  const copyTake = useCallback(async (take: Take): Promise<Take | null> => {
    const blob = await getTakeBlob(take.id).catch(() => null)
    if (!blob) return null
    const id = uid()
    try {
      await putTakeBlob(id, blob)
      // The copy lives here now, whatever device recorded the original.
      return { ...take, id, device: deviceId() }
    } catch {
      return null
    }
  }, [])

  const duplicateSong = useCallback(
    async (id: string) => {
      const source = stateRef.current.songs.find((s) => s.id === id)
      if (!source) return
      const sections: Section[] = []
      let copied = 0
      for (const section of source.sections) {
        const lines: Line[] = []
        for (const line of section.lines) {
          const takes: Take[] = []
          for (const take of line.takes) {
            const copy = await copyTake(take)
            if (copy) {
              takes.push(copy)
              copied++
            }
          }
          lines.push({ ...line, id: uid(), takes })
        }
        sections.push({ ...section, id: uid(), lines })
      }
      const songTakes: Take[] = []
      for (const take of source.takes) {
        const copy = await copyTake(take)
        if (copy) {
          songTakes.push(copy)
          copied++
        }
      }
      const copy: Song = {
        ...source,
        id: uid(),
        title: `${source.title} (copy)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sections,
        takes: songTakes,
      }
      setState((prev) => ({ ...prev, songs: [copy, ...prev.songs] }))
      notify(copied ? `Duplicated with ${copied} take${copied === 1 ? '' : 's'}` : 'Duplicated')
    },
    [copyTake, notify],
  )

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }, [])

  const toggleTheme = useCallback(() => {
    const nextIsDark = resolvedTheme !== 'dark'
    updateSettings({ theme: nextIsDark ? 'dark' : 'light' })
  }, [resolvedTheme, updateSettings])

  const importBackup = useCallback(
    (text: string) => {
      const parsed = parseBackup(text)
      setState((prev) => {
        const byId = new Map(prev.songs.map((s) => [s.id, s]))
        // A backup never resurrects a song that was erased for good.
        for (const song of parsed.songs) if (!song.purgedAt) byId.set(song.id, song)
        const folders = Array.from(new Set([...prev.folders, ...parsed.folders]))
        const vault = parsed.vault.length
          ? Array.from(new Map([...prev.vault, ...parsed.vault].map((v) => [v.id, v])).values())
          : prev.vault
        const lexicon = { ...parsed.lexicon, ...prev.lexicon }
        // Importing is an explicit restore, so it clears the tombstones it undoes.
        const vaultIds = new Set(vault.map((snippet) => snippet.id))
        const at = Date.now()
        const lexiconAt = { ...(prev.lexiconAt ?? {}) }
        for (const word of Object.keys(parsed.lexicon)) lexiconAt[word] = at
        return {
          ...prev,
          songs: Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt),
          folders,
          vault,
          lexicon,
          lexiconAt,
          removedVault: Object.fromEntries(
            Object.entries(prev.removedVault ?? {}).filter(([id]) => !vaultIds.has(id)),
          ),
          removedLexicon: Object.fromEntries(
            Object.entries(prev.removedLexicon ?? {}).filter(([word]) => !(word in lexicon)),
          ),
        }
      })
      notify(`Merged ${parsed.songs.length} song${parsed.songs.length === 1 ? '' : 's'} from backup`)
    },
    [notify],
  )

  const exportBackup = useCallback(() => {
    downloadBackup(stateRef.current)
    notify('Backup downloaded')
  }, [notify])

  const deleteAllSongs = useCallback(() => {
    const at = Date.now()
    stateRef.current.songs.forEach(sweepSongFiles)
    // Tombstones, not an empty array: an empty library must never be read as
    // "delete my whole account", and every device learns the purge.
    setState((prev) => ({
      ...prev,
      songs: prev.songs.map((song) =>
        song.purgedAt ? song : { ...song, purgedAt: at, updatedAt: at },
      ),
    }))
    navigate({ name: 'home' })
    notify('All songs deleted')
  }, [notify, sweepSongFiles])

  /* ------------------------------ versions, vault --------------------------- */

  const activeSong =
    route.name === 'song'
      ? state.songs.find((s) => s.id === route.id && !s.deletedAt && !s.purgedAt)
      : undefined

  const snapshotSong = useCallback((song: Song) => saveVersion(song, false), [])

  const restoreVersion = useCallback(
    (version: SongVersion) => {
      const song = stateRef.current.songs.find((s) => s.id === version.songId)
      if (!song) return
      // Keep what is on the page now, so restoring is itself reversible.
      saveVersion(song, false)
      const sections = sectionsFromVersion(version)
      setState((prev) => ({
        ...prev,
        songs: prev.songs.map((s) =>
          s.id === version.songId
            ? { ...s, title: version.title, sections, updatedAt: Date.now() }
            : s,
        ),
      }))
      notify('Version restored')
    },
    [notify],
  )

  const addSnippet = useCallback(
    (text: string, source?: string) => {
      const clean = text.trim()
      if (!clean) return
      if (stateRef.current.vault.some((s) => s.text === clean)) {
        notify('Already in your vault')
        return
      }
      setState((prev) => ({
        ...prev,
        vault: [
          { id: uid(), text: clean, createdAt: Date.now(), source },
          ...prev.vault,
        ].slice(0, 300),
      }))
      notify('Saved to your vault')
    },
    [notify],
  )

  const removeSnippet = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      vault: prev.vault.filter((s) => s.id !== id),
      // Without a tombstone the other device imports the snippet again.
      removedVault: { ...(prev.removedVault ?? {}), [id]: Date.now() },
    }))
  }, [])

  const updateLexicon = useCallback((lexicon: Record<string, string>) => {
    setState((prev) => {
      const at = Date.now()
      const lexiconAt = { ...(prev.lexiconAt ?? {}) }
      const removedLexicon = { ...(prev.removedLexicon ?? {}) }
      for (const [word, phones] of Object.entries(lexicon)) {
        if (prev.lexicon[word] !== phones) {
          lexiconAt[word] = at
          delete removedLexicon[word]
        }
      }
      for (const word of Object.keys(prev.lexicon)) {
        if (!(word in lexicon)) removedLexicon[word] = at
      }
      return { ...prev, lexicon, lexiconAt, removedLexicon }
    })
  }, [])

  /* ---------------------------- automatic versions -------------------------- */

  const lastSessionSong = useRef<string | null>(null)
  useEffect(() => {
    const id = route.name === 'song' ? route.id : null
    const previous = lastSessionSong.current
    if (previous && previous !== id) {
      const song = stateRef.current.songs.find((s) => s.id === previous)
      if (song) saveVersion(song, true)
    }
    lastSessionSong.current = id
  }, [route])

  useEffect(() => {
    if (!activeSong) return
    const timer = window.setInterval(() => {
      const song = stateRef.current.songs.find((s) => s.id === activeSong.id)
      if (song) saveVersion(song, true)
    }, 120_000)
    return () => window.clearInterval(timer)
  }, [activeSong?.id])

  useEffect(() => {
    if (route.name === 'song' && !activeSong) {
      const exists = state.songs.some((s) => s.id === route.id)
      if (!exists) navigate({ name: 'home' })
    }
  }, [route, activeSong, state.songs])

  return (
    <>
      {activeSong ? (
        <Editor
          song={activeSong}
          settings={state.settings}
          lexicon={state.lexicon}
          snippets={state.vault}
          streak={streakCount(state.streak.days)}
          saveStatus={saveStatus}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onUpdateSong={updateSong}
          onBack={() => navigate({ name: 'home' })}
          onUpdateSettings={updateSettings}
          onUpdateLexicon={updateLexicon}
          onNotify={notify}
          onExportBackup={exportBackup}
          onImportBackup={importBackup}
          onDeleteAllSongs={deleteAllSongs}
          onDeleteSong={() => deleteSong(activeSong.id)}
          onSaveVersion={() => {
            const saved = snapshotSong(activeSong)
            notify(saved ? 'Version saved' : 'This draft is already saved as a version')
          }}
          onRestoreVersion={restoreVersion}
          onAddSnippet={(text) => addSnippet(text, activeSong.title)}
          onRemoveSnippet={removeSnippet}
          resolvedTheme={resolvedTheme}
          cloud={cloud}
        />
      ) : (
        <Home
          songs={state.songs}
          folders={state.folders}
          settings={state.settings}
          lexicon={state.lexicon}
          streak={streakCount(state.streak.days)}
          streakDays={state.streak.days}
          onCreateSong={createSong}
          onOpenSong={(id) => navigate({ name: 'song', id })}
          onRenameSong={(id, title) => mutateSong(id, (s) => ({ ...s, title }))}
          onMoveSong={(id, folder) =>
            setState((prev) => ({
              ...prev,
              folders: prev.folders.includes(folder) ? prev.folders : [...prev.folders, folder],
              songs: prev.songs.map((s) => (s.id === id ? { ...s, folder, updatedAt: Date.now() } : s)),
            }))
          }
          onDeleteSong={deleteSong}
          onRestoreSong={restoreSong}
          onPurgeSong={purgeSong}
          onDuplicateSong={duplicateSong}
          onUpdateSettings={updateSettings}
          onUpdateLexicon={updateLexicon}
          onImportBackup={importBackup}
          onExportBackup={exportBackup}
          onDeleteAllSongs={deleteAllSongs}
          onNotify={notify}
          onToggleTheme={toggleTheme}
          resolvedTheme={resolvedTheme}
          cloud={cloud}
        />
      )}

      {conflict && (
        <div className="conflict-bar" role="alert">
          <div>
            <strong>Another tab saved changes.</strong>
            <span>This tab has stopped writing so neither draft is lost.</span>
          </div>
          <div className="conflict-actions">
            <button className="ghost-btn sm" onClick={loadRemote}>Load that version</button>
            <button
              className="link-btn"
              onClick={() => {
                setConflict(null)
                notify('Keeping this tab — it will save over the other one')
              }}
            >
              Keep this tab
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${conflict ? 'is-raised' : ''}`} role="status">
          {toast}
        </div>
      )}
    </>
  )
}
