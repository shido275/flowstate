import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Cloud, CloudOff, Flame, Folder, ListFilter, Moon, MoreHorizontal, Music2, Plus, RotateCcw,
  Search, Settings as SettingsIcon, Sun, Trash2, Upload, X,
} from 'lucide-react'
import type { Settings, Song, Vibe } from '../types'
import { VIBE_OPTIONS, lineCount, todayKey } from '../types'
import { formatRelative, greeting } from '../lib/storage'
import type { CloudControl } from '../lib/cloud/useCloudSync'
import { IconButton, Segmented, Sheet, WaveMark } from './ui'
import SettingsSheet from './SettingsSheet'
import CloudSheet from './CloudSheet'

type SortKey = 'updated' | 'created' | 'title' | 'lines'

interface Props {
  songs: Song[]
  folders: string[]
  settings: Settings
  lexicon: Record<string, string>
  streak: number
  streakDays: string[]
  resolvedTheme: string
  onCreateSong: (opts: { title: string; folder: string; vibe: Vibe; bpm: number }) => void
  onOpenSong: (id: string) => void
  onRenameSong: (id: string, title: string) => void
  onMoveSong: (id: string, folder: string) => void
  onDeleteSong: (id: string) => void
  onRestoreSong: (id: string) => void
  onPurgeSong: (id: string) => void
  onDuplicateSong: (id: string) => void
  onUpdateSettings: (patch: Partial<Settings>) => void
  onUpdateLexicon: (lexicon: Record<string, string>) => void
  onImportBackup: (text: string) => void
  onExportBackup: () => void
  onDeleteAllSongs: () => void
  onNotify: (msg: string) => void
  onToggleTheme: () => void
  cloud: CloudControl
}

const snippetOf = (song: Song) => {
  const words = song.sections
    .flatMap((s) => s.lines)
    .map((l) => l.text.trim())
    .filter(Boolean)
  return words.slice(0, 2).join(' · ')
}

export default function Home(props: Props) {
  const {
    songs, folders, settings, lexicon, streak, streakDays, resolvedTheme, onCreateSong, onOpenSong,
    onRenameSong, onMoveSong, onDeleteSong, onRestoreSong, onPurgeSong,
    onDuplicateSong, onUpdateSettings, onUpdateLexicon, onImportBackup, onExportBackup,
    onDeleteAllSongs, onNotify, onToggleTheme, cloud,
  } = props

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [filter, setFilter] = useState<string>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingPurge, setPendingPurge] = useState<string | null>(null)
  const [cloudOpen, setCloudOpen] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  // A reset link signs you in; ask for the new password instead of leaving you
  // at the library wondering why the link "did nothing".
  useEffect(() => {
    if (cloud.recovery) setCloudOpen(true)
  }, [cloud.recovery])

  // Purged songs are tombstones: they keep the library honest across devices but
  // never show up as a song again.
  const live = songs.filter((s) => !s.purgedAt)
  const active = live.filter((s) => !s.deletedAt)
  const deleted = live.filter((s) => s.deletedAt)

  const visible = useMemo(() => {
    let list = filter === 'trash' ? deleted : active
    if (filter !== 'all' && filter !== 'trash') list = list.filter((s) => s.folder === filter)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.topic.toLowerCase().includes(q) ||
          s.sections.some((sec) => sec.lines.some((l) => l.text.toLowerCase().includes(q))),
      )
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'created') return b.createdAt - a.createdAt
      if (sort === 'lines') return lineCount(b) - lineCount(a)
      return b.updatedAt - a.updatedAt
    })
    return sorted
  }, [active, deleted, filter, query, sort])

  const openRename = (song: Song) => {
    setRenameId(song.id)
    setRenameValue(song.title)
    setMenuId(null)
  }

  const cloudLabel =
    cloud.stage === 'loading'
      ? 'Checking account…'
      : cloud.stage === 'signed-out'
        ? 'Sign in to sync'
        : cloud.otherAccount
          ? 'Choose account'
          : cloud.status === 'syncing'
            ? 'Syncing…'
            : cloud.status === 'error'
              ? 'Sync issue'
              : cloud.status === 'offline'
                ? 'Offline'
                : 'Synced'
  const cloudTone =
    cloud.status === 'error' || cloud.otherAccount
      ? 'is-error'
      : cloud.status === 'syncing'
        ? 'is-syncing'
        : ''

  return (
    <div className="home page">
      <header className="home-head">
        <div className="home-identity">
          <div className="greeting">{greeting()}</div>
          <div className="home-wordmark">
            <span className="logo-wave"><WaveMark /></span>
            <h1>Flowstate</h1>
          </div>
          <div className="home-sub">
            {active.length === 0 ? 'A blank page, ready when you are' : `${active.length} song${active.length === 1 ? '' : 's'}`}
            {streak > 0 && (
              <span className="streak">
                <Flame size={13} strokeWidth={1.8} /> {streak} day{streak === 1 ? '' : 's'}
              </span>
            )}
            {cloud.configured && (
              <button
                className={`sync-pill ${cloudTone}`}
                onClick={() => setCloudOpen(true)}
                title={
                  cloud.otherAccount
                    ? 'This device’s songs were last synced to another account'
                    : cloud.email
                      ? `Signed in as ${cloud.email}`
                      : 'Sync your songs across devices'
                }
              >
                {cloud.stage === 'signed-in' ? <Cloud size={13} /> : <CloudOff size={13} />}
                <span>{cloudLabel}</span>
              </button>
            )}
          </div>
        </div>
        <div className="head-actions">
          <IconButton onClick={onToggleTheme} title={resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'} aria-label="Toggle theme">
            {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
          <IconButton onClick={() => importRef.current?.click()} title="Import backup" aria-label="Import backup">
            <Upload size={18} />
          </IconButton>
          <IconButton onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings">
            <SettingsIcon size={18} />
          </IconButton>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                onImportBackup(await file.text())
              } catch (err) {
                onNotify(err instanceof Error ? err.message : 'Could not read that backup')
              }
              e.target.value = ''
            }}
          />
        </div>
      </header>

      {streakDays.length > 0 && <StreakCalendar days={streakDays} />}

      {(active.length > 0 || deleted.length > 0) && (
        <>
          <div className="library-tools">
            <label className="search-field">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs and lines"
                aria-label="Search songs"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
            <label className="sort-control">
              <ListFilter size={15} />
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort songs">
                <option value="updated">Recent</option>
                <option value="created">Created</option>
                <option value="title">Title</option>
                <option value="lines">Longest</option>
              </select>
            </label>
          </div>
          <div className="folder-row">
            <button className={`chip ${filter === 'all' ? 'is-on' : ''}`} onClick={() => setFilter('all')}>
              All
            </button>
            {folders.map((f) => (
              <button key={f} className={`chip ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(f)}>
                <Folder size={12} /> {f}
              </button>
            ))}
            {deleted.length > 0 && (
              <button className={`chip trash-chip ${filter === 'trash' ? 'is-on' : ''}`} onClick={() => setFilter('trash')}>
                <Trash2 size={12} /> Trash · {deleted.length}
              </button>
            )}
          </div>
        </>
      )}

      {visible.length === 0 ? (
        <div className="home-stage">
          {query || filter !== 'all' ? (
            <div className="empty-library">
              <h2>Nothing here yet</h2>
              <p>No songs match that search or folder.</p>
              <button className="ghost-btn" onClick={() => { setQuery(''); setFilter('all') }}>
                Clear filters
              </button>
            </div>
          ) : active.length === 0 && deleted.length === 0 ? (
            <div className="home-empty">
              <div className="empty-orbit" aria-hidden>
                <WaveMark />
              </div>
              <h2>A quiet place to write.</h2>
              <p>
                Rhymes light up as you type, syllables stay honest, and every take stays
                on this device. No account needed, no ads, no tracking.
              </p>
              <button className="primary-btn" onClick={() => setCreateOpen(true)}>
                <Plus size={17} /> Start a song
              </button>
              <div className="empty-feats">
                <span>Live rhyme colour</span>
                <span>·</span>
                <span>Syllable grid</span>
                <span>·</span>
                <span>Beats</span>
                <span>·</span>
                <span>Takes</span>
                <span>·</span>
                <span>Teleprompter</span>
              </div>
            </div>
          ) : (
            <div className="empty-library">
              <h2>Nothing here</h2>
              <p>This folder is empty.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="song-grid">
          {visible.map((song) => {
            const isTrash = !!song.deletedAt
            return (
              <article
                key={song.id}
                className={`song-card ${isTrash ? 'is-trash' : ''}`}
                onClick={() => !isTrash && onOpenSong(song.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (!isTrash && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    onOpenSong(song.id)
                  }
                }}
              >
                <div className="card-top">
                  <div className="song-note" aria-hidden>
                    <Music2 size={19} strokeWidth={1.7} />
                  </div>
                  <div className="song-titles">
                    <h2>{song.title || 'Untitled song'}</h2>
                    <div className="song-meta">
                      {isTrash ? 'In trash' : `Edited ${formatRelative(song.updatedAt)}`} · {song.folder}
                    </div>
                  </div>
                  {!isTrash && (
                    <button
                      className="card-menu-btn"
                      aria-label="Song menu"
                      onClick={(e) => { e.stopPropagation(); setMenuId(menuId === song.id ? null : song.id) }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  )}
                </div>
                <p className="song-snippet">{snippetOf(song) || 'Tap to begin writing…'}</p>
                <div className="card-foot">
                  <span>{lineCount(song)} bars</span>
                  <span>{song.vibe} · {song.bpm} BPM</span>
                </div>
                {isTrash && (
                  <div className="trash-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="ghost-btn sm" onClick={() => onRestoreSong(song.id)}>
                      <RotateCcw size={13} /> Restore
                    </button>
                    <button
                      className={`ghost-btn sm danger ${pendingPurge === song.id ? 'is-armed' : ''}`}
                      onClick={() => {
                        if (pendingPurge === song.id) { onPurgeSong(song.id); setPendingPurge(null) }
                        else setPendingPurge(song.id)
                      }}
                    >
                      <Trash2 size={13} /> {pendingPurge === song.id ? 'Tap to erase' : 'Delete forever'}
                    </button>
                  </div>
                )}
                {menuId === song.id && (
                  <>
                    <div className="menu-backdrop" onClick={(e) => { e.stopPropagation(); setMenuId(null) }} />
                    <div className="card-menu" onClick={(e) => e.stopPropagation()} role="menu">
                      <button role="menuitem" onClick={() => openRename(song)}>Rename</button>
                      <button role="menuitem" onClick={() => { onDuplicateSong(song.id); setMenuId(null) }}>Duplicate</button>
                      {folders.filter((f) => f !== song.folder).map((f) => (
                        <button key={f} role="menuitem" onClick={() => { onMoveSong(song.id, f); setMenuId(null) }}>
                          Move to {f}
                        </button>
                      ))}
                      <button role="menuitem" className="danger" onClick={() => { onDeleteSong(song.id); setMenuId(null) }}>
                        Move to trash
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}

      <button className="fab" onClick={() => setCreateOpen(true)}>
        <Plus size={20} /> Create
      </button>

      <CreateSongDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        folders={folders}
        defaultBpm={settings.bpm}
        onCreate={(opts) => { onCreateSong(opts); setCreateOpen(false) }}
      />

      <Sheet open={renameId !== null} onClose={() => setRenameId(null)} className="dialog-sm" label="Rename song">
        <div className="dialog">
          <h2>Rename song</h2>
          <input
            autoFocus
            className="text-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameId) {
                onRenameSong(renameId, renameValue.trim() || 'Untitled song')
                setRenameId(null)
              }
            }}
          />
          <div className="dialog-actions">
            <button className="ghost-btn" onClick={() => setRenameId(null)}>Cancel</button>
            <button
              className="primary-btn"
              onClick={() => {
                if (renameId) onRenameSong(renameId, renameValue.trim() || 'Untitled song')
                setRenameId(null)
              }}
            >
              Save
            </button>
          </div>
        </div>
      </Sheet>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        lexicon={lexicon}
        onUpdate={onUpdateSettings}
        onUpdateLexicon={onUpdateLexicon}
        onImportBackup={onImportBackup}
        onExportBackup={onExportBackup}
        onNotify={onNotify}
        onDeleteAll={onDeleteAllSongs}
        hasSongs={songs.filter((s) => !s.deletedAt && !s.purgedAt).length > 0}
      />

      <CloudSheet
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        cloud={cloud}
        onExportBackup={onExportBackup}
      />
    </div>
  )
}

function StreakCalendar({ days }: { days: string[] }) {
  const set = useMemo(() => new Set(days), [days])
  const weeks = 5
  const today = new Date()
  const mondayOffset = (today.getDay() + 6) % 7
  const start = new Date(today)
  start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7)
  const cells = Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = todayKey(date)
    return {
      key,
      active: set.has(key),
      future: date.getTime() > today.getTime(),
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    }
  })
  const written = days.slice(-35).length

  return (
    <div className="streak-calendar" aria-label={`Writing streak: ${written} days in the last five weeks`}>
      <div className="streak-grid" role="img">
        {cells.map((cell) => (
          <span
            key={cell.key}
            className={`streak-day ${cell.active ? 'is-on' : ''} ${cell.future ? 'is-future' : ''}`}
            title={`${cell.label}${cell.active ? ' — wrote' : ''}`}
          />
        ))}
      </div>
      <div className="streak-copy">
        <span>Last five weeks</span>
        <em>{written} day{written === 1 ? '' : 's'} with the pen moving</em>
      </div>
    </div>
  )
}

function CreateSongDialog({
  open, onClose, folders, defaultBpm, onCreate,
}: {
  open: boolean
  onClose: () => void
  folders: string[]
  defaultBpm: number
  onCreate: (opts: { title: string; folder: string; vibe: Vibe; bpm: number }) => void
}) {
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState('Drafts')
  const [vibe, setVibe] = useState<Vibe>('trap')
  const [bpm, setBpm] = useState(defaultBpm)

  const submit = () => {
    onCreate({ title: title.trim() || 'Untitled song', folder: folder.trim() || 'Drafts', vibe, bpm })
    setTitle('')
    setVibe('trap')
    setFolder('Drafts')
  }

  return (
    <Sheet open={open} onClose={onClose} className="dialog-sm" label="Create a song">
      <div className="dialog">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">New song</span>
            <h2>Start with a name</h2>
          </div>
          <IconButton onClick={onClose} aria-label="Close"><X size={17} /></IconButton>
        </div>
        <input
          autoFocus
          className="text-input title-input"
          placeholder="Untitled song"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div className="field">
          <span className="field-label">Vibe</span>
          <Segmented
            value={vibe}
            onChange={setVibe}
            options={VIBE_OPTIONS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
            ariaLabel="Song vibe"
          />
        </div>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Folder</span>
            <input
              className="text-input"
              list="home-folders"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            />
            <datalist id="home-folders">
              {folders.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
          <label className="field bpm-field">
            <span className="field-label">Tempo</span>
            <div className="bpm-input">
              <input
                type="number"
                min={40}
                max={220}
                className="text-input"
                value={bpm}
                onChange={(e) => setBpm(Math.max(40, Math.min(220, Number(e.target.value) || 90)))}
              />
              <span>BPM</span>
            </div>
          </label>
        </div>
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={submit}><Plus size={16} /> Create song</button>
        </div>
      </div>
    </Sheet>
  )
}
