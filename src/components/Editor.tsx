import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, BookOpen, Check, CloudOff, Flame, History as HistoryIcon, LayoutGrid, Maximize2,
  Minimize2, MonitorPlay, MoreHorizontal, Palette, Pause, Play, Plus, Redo2, Share2,
  Settings as SettingsIcon, Undo2,
} from 'lucide-react'
import type { Line, Section, SectionKind, Settings, Snippet, Song } from '../types'
import { SECTION_LABELS, SECTION_OPTIONS, blankLine, blankSection } from '../types'
import { collectFamilies, lineSyllables } from '../lib/engine'
import { useDictionaryEpoch } from '../lib/useDictionary'
import { rhymeScheme } from '../lib/analysis'
import {
  downloadSongJson, downloadSongLrc, downloadSongMarkdown, downloadSongTxt,
} from '../lib/export'
import { BeatEngine, tapBpm } from '../lib/audio'
import { deleteTakeBlob, formatRelative } from '../lib/storage'
import type { SongVersion } from '../lib/versions'
import LineRow, { type WordTarget } from './LineRow'
import WordDrawer from './WordDrawer'
import Tools, { type ToolTab } from './Tools'
import SettingsSheet from './SettingsSheet'
import HistorySheet from './HistorySheet'
import SongTakeSheet from './SongTakeSheet'
import ShareSheet from './ShareSheet'
import Teleprompter from './Teleprompter'
import type { CloudControl } from '../lib/cloud/useCloudSync'
import { IconButton } from './ui'

interface Props {
  song: Song
  settings: Settings
  lexicon: Record<string, string>
  snippets: Snippet[]
  streak: number
  saveStatus: 'saving' | 'saved' | 'error'
  resolvedTheme: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onUpdateSong: (song: Song) => void
  onUpdateSettings: (patch: Partial<Settings>) => void
  onUpdateLexicon: (lexicon: Record<string, string>) => void
  onBack: () => void
  onNotify: (msg: string) => void
  onDeleteSong: () => void
  onExportBackup: () => void
  onImportBackup: (text: string) => void
  onDeleteAllSongs: () => void
  onSaveVersion: () => void
  onRestoreVersion: (version: SongVersion) => void
  onAddSnippet: (text: string) => void
  onRemoveSnippet: (id: string) => void
  cloud: CloudControl
}

const RHYME_MODES: Settings['rhymeMode'][] = ['off', 'strict', 'rap', 'loose']

export default function Editor({
  song, settings, lexicon, snippets, streak, saveStatus, resolvedTheme, canUndo, canRedo,
  onUndo, onRedo, onUpdateSong, onUpdateSettings, onUpdateLexicon, onBack, onNotify,
  onDeleteSong, onExportBackup, onImportBackup, onDeleteAllSongs, onSaveVersion,
  onRestoreVersion, onAddSnippet, onRemoveSnippet, cloud,
}: Props) {
  // Re-render once the pronunciation dictionary chunk lands.
  useDictionaryEpoch()
  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [wordTarget, setWordTarget] = useState<WordTarget | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolsTab, setToolsTab] = useState<ToolTab>('rhyme')
  const [prompterOpen, setPrompterOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [songTakesOpen, setSongTakesOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sectionMenu, setSectionMenu] = useState<string | null>(null)
  const [pendingSectionDelete, setPendingSectionDelete] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const lineRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const engineRef = useRef<BeatEngine | null>(null)
  const taps = useRef<number[]>([])
  const focusedOnce = useRef(false)

  const allLines = useMemo(
    () => song.sections.flatMap((s) => s.lines.map((l) => l.text)),
    [song],
  )
  const families = useMemo(
    () => collectFamilies(allLines, settings.rhymeMode),
    [allLines, settings.rhymeMode],
  )
  const schemes = useMemo(
    () => new Map(song.sections.map((s) => [s.id, rhymeScheme(s)])),
    [song.sections],
  )

  const totalSyllables = useMemo(() => allLines.reduce((n, l) => n + lineSyllables(l), 0), [allLines])
  const filledBars = allLines.filter((l) => l.trim()).length

  useEffect(() => {
    if (focusedOnce.current) return
    focusedOnce.current = true
    const firstLine = song.sections.flatMap((s) => s.lines).find((l) => !l.text.trim())
    if (firstLine) {
      window.setTimeout(() => lineRefs.current.get(firstLine.id)?.focus(), 180)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    engineRef.current?.update({
      bpm: settings.bpm,
      style: settings.beatStyle,
      volume: settings.volume,
      click: settings.click,
    })
  }, [settings.bpm, settings.beatStyle, settings.volume, settings.click])

  useEffect(() => {
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!focusMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusMode(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [focusMode])

  // On phones the on-screen keyboard shrinks the visual viewport; tuck the dock
  // away instead of letting it sit on top of the bar being written.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      const keyboardOpen = window.innerHeight - viewport.height > 120
      document.documentElement.classList.toggle('kb-open', keyboardOpen)
      document.documentElement.style.setProperty('--vvh', `${viewport.height}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    return () => {
      viewport.removeEventListener('resize', update)
      document.documentElement.classList.remove('kb-open')
      document.documentElement.style.removeProperty('--vvh')
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        downloadSongTxt(song)
        onNotify('Text file saved')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [song, onNotify])

  useEffect(() => {
    if (!sectionMenu) return
    const close = () => setSectionMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [sectionMenu])

  useEffect(() => {
    if (!menuOpen && !sectionMenu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      setSectionMenu(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen, sectionMenu])

  const registerRef = (id: string, el: HTMLTextAreaElement | null) => {
    if (el) lineRefs.current.set(id, el)
    else lineRefs.current.delete(id)
  }

  const focusLine = (id: string, caret: 'end' | number = 'end') => {
    window.setTimeout(() => {
      const el = lineRefs.current.get(id)
      if (!el) return
      el.focus()
      const pos = caret === 'end' ? el.value.length : Math.max(0, Math.min(caret, el.value.length))
      el.setSelectionRange(pos, pos)
    }, 20)
  }

  const patchSection = (sectionId: string, updater: (section: Section) => Section) => {
    onUpdateSong({
      ...song,
      sections: song.sections.map((s) => (s.id === sectionId ? updater(s) : s)),
    })
  }

  const patchLine = (sectionId: string, lineId: string, patch: Partial<Line>) => {
    patchSection(sectionId, (section) => ({
      ...section,
      lines: section.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    }))
  }

  const updateSectionField = (sectionId: string, patch: Partial<Section>) => {
    patchSection(sectionId, (s) => ({ ...s, ...patch }))
  }

  const addLine = (sectionId: string, afterLineId?: string, text = '') => {
    const line = blankLine(text)
    patchSection(sectionId, (section) => {
      const index = afterLineId ? section.lines.findIndex((l) => l.id === afterLineId) : -1
      const lines = [...section.lines]
      lines.splice(index >= 0 ? index + 1 : lines.length, 0, line)
      return { ...section, lines }
    })
    focusLine(line.id, text ? 'end' : 0)
    return line.id
  }

  const splitLine = (sectionId: string, lineId: string, start: number, end: number) => {
    const section = song.sections.find((s) => s.id === sectionId)
    const line = section?.lines.find((l) => l.id === lineId)
    if (!section || !line) return
    const before = line.text.slice(0, start)
    const after = line.text.slice(end)
    const newLine = blankLine(after)
    patchSection(sectionId, (sec) => {
      const index = sec.lines.findIndex((l) => l.id === lineId)
      const lines = [...sec.lines]
      lines[index] = { ...line, text: before }
      lines.splice(index + 1, 0, newLine)
      return { ...sec, lines }
    })
    focusLine(newLine.id, 0)
  }

  const pasteLines = (sectionId: string, lineId: string, pasted: string[]) => {
    const section = song.sections.find((s) => s.id === sectionId)
    const line = section?.lines.find((l) => l.id === lineId)
    if (!section || !line) return
    const el = lineRefs.current.get(lineId)
    const start = el?.selectionStart ?? line.text.length
    const end = el?.selectionEnd ?? start
    const first = pasted[0] ?? ''
    const rest = pasted.slice(1).map((t) => blankLine(t))
    patchSection(sectionId, (sec) => {
      const index = sec.lines.findIndex((l) => l.id === lineId)
      const lines = [...sec.lines]
      lines[index] = { ...line, text: line.text.slice(0, start) + first + line.text.slice(end) }
      lines.splice(index + 1, 0, ...rest)
      return { ...sec, lines }
    })
    const target = rest.length ? rest[rest.length - 1] : line
    focusLine(target.id, 'end')
  }

  const removeLine = (sectionId: string, lineId: string) => {
    const section = song.sections.find((s) => s.id === sectionId)
    if (!section) return
    if (section.lines.length <= 1) {
      patchLine(sectionId, lineId, { text: '' })
      return
    }
    const doomed = section.lines.find((l) => l.id === lineId)
    doomed?.takes.forEach((take) => void deleteTakeBlob(take.id))
    const index = section.lines.findIndex((l) => l.id === lineId)
    const nextFocus = section.lines[index - 1]?.id ?? section.lines[index + 1]?.id
    patchSection(sectionId, (sec) => ({ ...sec, lines: sec.lines.filter((l) => l.id !== lineId) }))
    if (nextFocus) focusLine(nextFocus, 'end')
  }

  const navigateLine = (sectionId: string, lineId: string, dir: -1 | 1) => {
    const ordered = song.sections.flatMap((s) => s.lines.map((l) => l.id))
    const idx = ordered.indexOf(lineId)
    const next = ordered[idx + dir]
    if (next) focusLine(next, dir === -1 ? 'end' : 'end')
    else if (dir === 1) {
      const section = song.sections.find((s) => s.id === sectionId)
      if (section) addLine(section.id)
    } else {
      const prev = ordered[idx - 1]
      if (prev) focusLine(prev, 'end')
    }
  }

  const addSection = () => {
    const kind: SectionKind = 'verse'
    const number = song.sections.filter((s) => s.kind === 'verse').length + 1
    const section = { ...blankSection(kind, `Verse ${number}`), lines: [blankLine(), blankLine(), blankLine(), blankLine()] }
    onUpdateSong({ ...song, sections: [...song.sections, section] })
    onNotify('Section added')
  }

  const moveSection = (sectionId: string, dir: -1 | 1) => {
    const index = song.sections.findIndex((s) => s.id === sectionId)
    const target = index + dir
    if (index < 0 || target < 0 || target >= song.sections.length) return
    const sections = [...song.sections]
    const [item] = sections.splice(index, 1)
    sections.splice(target, 0, item)
    onUpdateSong({ ...song, sections })
  }

  const deleteSection = (sectionId: string) => {
    if (song.sections.length <= 1) {
      onNotify('Every song needs at least one section')
      return
    }
    onUpdateSong({ ...song, sections: song.sections.filter((s) => s.id !== sectionId) })
    setPendingSectionDelete(null)
    setSectionMenu(null)
    onNotify('Section deleted')
  }

  const toggleBeat = () => {
    if (!engineRef.current) engineRef.current = new BeatEngine()
    if (playing) {
      engineRef.current.stop()
      setPlaying(false)
    } else {
      engineRef.current.start(settings.bpm, settings.beatStyle, settings.volume, settings.click)
      setPlaying(true)
    }
  }

  const tapTempo = () => {
    const now = performance.now()
    taps.current = [...taps.current.filter((t) => now - t < 3000), now].slice(-6)
    const bpm = tapBpm(taps.current)
    if (bpm) onUpdateSettings({ bpm })
  }

  const applyWord = (replacement: string) => {
    if (!wordTarget) return
    const section = song.sections.find((s) => s.id === wordTarget.sectionId)
    const line = section?.lines.find((l) => l.id === wordTarget.lineId)
    if (!line) return
    const text = line.text.slice(0, wordTarget.start) + replacement + line.text.slice(wordTarget.end)
    const caret = wordTarget.start + replacement.length
    patchLine(wordTarget.sectionId, wordTarget.lineId, { text })
    setWordTarget(null)
    focusLine(wordTarget.lineId, caret)
  }

  const jumpToLine = (lineId: string) => {
    setActiveLineId(lineId)
    focusLine(lineId, 'end')
    window.setTimeout(() => {
      document.querySelector(`[data-line-id="${lineId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
  }

  const cycleRhymeMode = () => {
    const i = RHYME_MODES.indexOf(settings.rhymeMode)
    onUpdateSettings({ rhymeMode: RHYME_MODES[(i + 1) % RHYME_MODES.length] })
  }

  const openTools = (tab: ToolTab) => {
    setToolsTab(tab)
    setToolsOpen(true)
  }

  const saveLabel = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved'

  return (
    <div className={`editor page ${focusMode ? 'is-focus' : ''}`} style={{ ['--font-scale' as string]: settings.fontScale }}>
      <header className="editor-topbar">
        <IconButton onClick={onBack} aria-label="Back to library" className="back-btn">
          <ArrowLeft size={19} />
        </IconButton>
        <div className="editor-titles">
          <span className="eyebrow">Edit song</span>
          <div className="editor-meta">
            {filledBars} bar{filledBars === 1 ? '' : 's'} · {song.sections.length} part{song.sections.length === 1 ? '' : 's'}
            <span className={`save-dot ${saveStatus}`} title={saveLabel} />
            <span className="save-label">{saveLabel}</span>
            {streak > 0 && <span className="editor-streak"><Flame size={12} /> {streak}</span>}
          </div>
        </div>
        <div className="head-actions editor-actions">
          <div className="undo-group">
            <IconButton onClick={onUndo} disabled={!canUndo} title="Undo (⌘/Ctrl+Z)" aria-label="Undo">
              <Undo2 size={17} />
            </IconButton>
            <IconButton onClick={onRedo} disabled={!canRedo} title="Redo (⇧⌘/Ctrl+Y)" aria-label="Redo">
              <Redo2 size={17} />
            </IconButton>
            <IconButton onClick={() => setHistoryOpen(true)} title="Version history" aria-label="Version history">
              <HistoryIcon size={17} />
            </IconButton>
          </div>
          <IconButton onClick={() => setFocusMode(true)} title="Focus mode" aria-label="Focus mode">
            <Maximize2 size={17} />
          </IconButton>
          <IconButton onClick={() => openTools('song')} title="Full song" aria-label="Full song" className="fullsong-btn">
            <BookOpen size={17} />
          </IconButton>
          <IconButton onClick={() => openTools('rhyme')} title="Studio tools" aria-label="Studio tools">
            <LayoutGrid size={17} />
          </IconButton>
          <IconButton onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings">
            <SettingsIcon size={17} />
          </IconButton>
          <div className="header-menu-wrap">
            <IconButton onClick={() => setMenuOpen((v) => !v)} title="More" aria-label="More song actions">
              <MoreHorizontal size={18} />
            </IconButton>
            {menuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="card-menu header-menu">
                  <button disabled={!canUndo} onClick={() => { onUndo(); setMenuOpen(false) }}>Undo</button>
                  <button disabled={!canRedo} onClick={() => { onRedo(); setMenuOpen(false) }}>Redo</button>
                  <div className="menu-sep" role="separator" />
                  <button onClick={() => { setSongTakesOpen(true); setMenuOpen(false) }}>Record the whole song…</button>
                  <button onClick={() => { setShareOpen(true); setMenuOpen(false) }}>
                    <Share2 size={13} /> Share this song…
                  </button>
                  <button onClick={() => { setHistoryOpen(true); setMenuOpen(false) }}>Version history…</button>
                  <button onClick={() => { onSaveVersion(); setMenuOpen(false) }}>Save a version now</button>
                  <div className="menu-sep" role="separator" />
                  <button onClick={() => { downloadSongTxt(song); setMenuOpen(false); onNotify('Text file saved') }}>Download .txt</button>
                  <button onClick={() => { downloadSongMarkdown(song); setMenuOpen(false); onNotify('Markdown saved') }}>Download .md</button>
                  <button onClick={() => { downloadSongLrc(song); setMenuOpen(false); onNotify('LRC timeline saved') }}>Download .lrc</button>
                  <button onClick={() => { downloadSongJson(song); setMenuOpen(false); onNotify('Song JSON saved') }}>Download .json</button>
                  <div className="menu-sep" role="separator" />
                  <button onClick={() => { setPrompterOpen(true); setMenuOpen(false) }}>Booth teleprompter</button>
                  <button onClick={() => { setSettingsOpen(true); setMenuOpen(false) }}>Song settings</button>
                  <button className="danger" onClick={() => { setMenuOpen(false); onDeleteSong() }}>
                    Move song to trash
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {focusMode && (
        <button className="focus-exit" onClick={() => setFocusMode(false)}>
          <Minimize2 size={15} /> Exit focus
        </button>
      )}

      <main className="editor-paper">
        <div className="song-head">
          <input
            className="song-title-input"
            value={song.title}
            onChange={(e) => onUpdateSong({ ...song, title: e.target.value })}
            aria-label="Song title"
            spellCheck={false}
          />
          <div className="song-meta-line">
            <button className="meta-chip" onClick={() => openTools('cowrite')}>{song.vibe}</button>
            <span>·</span>
            <span>{song.bpm} BPM</span>
            <span>·</span>
            <button className="meta-chip" onClick={() => setSettingsOpen(true)}>{song.folder}</button>
            {song.topic && (
              <>
                <span>·</span>
                <span className="topic-line">{song.topic}</span>
              </>
            )}
          </div>
        </div>

        <div className="rule-with-dot" aria-hidden><span /><i /><span /></div>

        <div className="sections">
          {song.sections.map((section, sectionIndex) => {
            const scheme = schemes.get(section.id) ?? []
            const counts = section.lines.filter((l) => l.text.trim()).map((l) => lineSyllables(l.text))
            const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0
            const max = Math.max(1, ...counts)
            const bars = section.lines.filter((l) => l.text.trim()).length
            return (
              <section className="song-section" key={section.id}>
                <div className="section-head">
                  <div className="section-ident">
                    <select
                      className="section-kind-select"
                      value={section.kind}
                      onChange={(e) => {
                        const kind = e.target.value as SectionKind
                        patchSection(section.id, (s) => ({
                          ...s,
                          kind,
                          title: s.title === SECTION_LABELS[s.kind] ? SECTION_LABELS[kind] : s.title,
                        }))
                      }}
                      aria-label="Section kind"
                    >
                      {SECTION_OPTIONS.map((k) => (
                        <option key={k} value={k}>{SECTION_LABELS[k]}</option>
                      ))}
                    </select>
                    <input
                      className="section-title-input"
                      value={section.title}
                      onChange={(e) => updateSectionField(section.id, { title: e.target.value })}
                      aria-label="Section title"
                      spellCheck={false}
                    />
                  </div>
                  <div className="section-meta">
                    {bars} bar{bars === 1 ? '' : 's'}
                    {counts.length > 0 && <> · avg {Math.round(avg)} syl</>}
                  </div>
                  <div className="section-actions">
                    <button className="ghost-btn sm" onClick={() => addLine(section.id)}>
                      <Plus size={13} /> Bar
                    </button>
                    <button
                      className="icon-mini"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSectionMenu(sectionMenu === section.id ? null : section.id)
                      }}
                      aria-label="Section menu"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {sectionMenu === section.id && (
                      <div className="card-menu section-menu" onClick={(e) => e.stopPropagation()}>
                        <label className="menu-field">
                          Target syllables
                          <input
                            type="number"
                            min={4}
                            max={32}
                            value={section.target}
                            onChange={(e) => updateSectionField(section.id, { target: Number(e.target.value) || 12 })}
                          />
                        </label>
                        <button disabled={sectionIndex === 0} onClick={() => { moveSection(section.id, -1); setSectionMenu(null) }}>Move section up</button>
                        <button disabled={sectionIndex === song.sections.length - 1} onClick={() => { moveSection(section.id, 1); setSectionMenu(null) }}>Move section down</button>
                        <button
                          className="danger"
                          onClick={() => {
                            if (pendingSectionDelete === section.id) deleteSection(section.id)
                            else setPendingSectionDelete(section.id)
                          }}
                        >
                          {pendingSectionDelete === section.id ? 'Tap again to delete' : 'Delete section'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="lines">
                  {section.lines.map((line, index) => (
                    <LineRow
                      key={line.id}
                      line={line}
                      index={index}
                      sectionId={section.id}
                      song={song}
                      settings={settings}
                      families={families}
                      prevText={section.lines[index - 1]?.text ?? ''}
                      schemeLetter={scheme[index]?.letter || null}
                      avgSyllables={avg}
                      maxSyllables={max}
                      active={activeLineId === line.id}
                      registerRef={registerRef}
                      onFocus={() => setActiveLineId(line.id)}
                      onChangeText={(text) => patchLine(section.id, line.id, { text })}
                      onUpdateLine={(patch) => patchLine(section.id, line.id, patch)}
                      onSplit={(start, end) => splitLine(section.id, line.id, start, end)}
                      onPasteLines={(lines) => pasteLines(section.id, line.id, lines)}
                      onDeleteEmpty={() => removeLine(section.id, line.id)}
                      onNavigate={(dir) => navigateLine(section.id, line.id, dir)}
                      onOpenWord={setWordTarget}
                      onDelete={() => removeLine(section.id, line.id)}
                      onSaveToVault={() => onAddSnippet(line.text)}
                      onNotify={onNotify}
                    />
                  ))}
                </div>
                <button className="add-bar-link" onClick={() => addLine(section.id)}>
                  <Plus size={13} /> Add a bar
                </button>
              </section>
            )
          })}
        </div>

        <button className="add-section-btn" onClick={addSection}>
          <Plus size={15} /> Add a section
        </button>

        <footer className="paper-footer">
          <div className="footer-stats">
            <span>{totalSyllables} syllables</span>
            <span>·</span>
            <span>{filledBars} bars</span>
            <span>·</span>
            <span>edited {formatRelative(song.updatedAt)}</span>
          </div>
          <p>
            Double-click a word for rhymes, swaps and multis. Syllable glyphs sit to the right of
            every bar; the strip underneath shows drift from this section's average.
          </p>
          <div className="footer-badges">
            {streak > 0 && <span><Flame size={12} /> {streak}-day streak</span>}
            <span><CloudOff size={12} /> Local only</span>
            <span><Check size={12} /> Autosaved</span>
          </div>
        </footer>
      </main>

      <div className="dock">
        <button className={`dock-beat ${playing ? 'is-on' : ''}`} onClick={toggleBeat} title={playing ? 'Stop beat' : 'Play beat'}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
          <span>{playing ? 'Stop' : 'Beat'}</span>
        </button>
        <div className="dock-tempo">
          <input
            type="number"
            min={40}
            max={220}
            value={settings.bpm}
            onChange={(e) => onUpdateSettings({ bpm: Math.max(40, Math.min(220, Number(e.target.value) || 90)) })}
            aria-label="Tempo in BPM"
          />
          <span>BPM</span>
          <button className="tap-btn" onClick={tapTempo} title="Tap tempo">TAP</button>
        </div>
        <span className="dock-sep" />
        <button
          className="dock-btn"
          onClick={cycleRhymeMode}
          title="Cycle rhyme colour mode"
          aria-label={`Rhyme colouring: ${settings.rhymeMode}`}
        >
          <Palette size={16} />
          <span className="dock-mode-label">{settings.rhymeMode === 'off' ? 'No colour' : settings.rhymeMode}</span>
        </button>
        <button className="dock-btn" onClick={() => openTools('rhyme')} title="Studio tools" aria-label="Studio tools">
          <LayoutGrid size={16} /> <span>Tools</span>
        </button>
        <button
          className="dock-btn booth-btn"
          onClick={() => setPrompterOpen(true)}
          title="Booth teleprompter"
          aria-label="Booth teleprompter"
        >
          <MonitorPlay size={16} /> <span>Booth</span>
        </button>
      </div>

      <WordDrawer
        target={wordTarget}
        vibe={song.vibe}
        onClose={() => setWordTarget(null)}
        onApply={applyWord}
      />

      <Tools
        open={toolsOpen}
        initialTab={toolsTab}
        song={song}
        vibe={song.vibe}
        dark={resolvedTheme === 'dark'}
        snippets={snippets}
        onClose={() => setToolsOpen(false)}
        onUpdateSong={onUpdateSong}
        onNotify={onNotify}
        onJumpToLine={jumpToLine}
        onAddSnippet={onAddSnippet}
        onRemoveSnippet={onRemoveSnippet}
      />

      <HistorySheet
        open={historyOpen}
        songId={song.id}
        songTitle={song.title}
        onClose={() => setHistoryOpen(false)}
        onRestore={onRestoreVersion}
        onSaveNow={onSaveVersion}
        onNotify={onNotify}
      />

      <SongTakeSheet
        open={songTakesOpen}
        song={song}
        settings={settings}
        onClose={() => setSongTakesOpen(false)}
        onUpdateSong={onUpdateSong}
        onNotify={onNotify}
      />

      <ShareSheet
        open={shareOpen}
        song={song}
        cloud={cloud}
        onClose={() => setShareOpen(false)}
        onNotify={onNotify}
      />

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
        hasSongs
      />

      {prompterOpen && (
        <Teleprompter song={song} settings={settings} onClose={() => setPrompterOpen(false)} />
      )}
    </div>
  )
}
