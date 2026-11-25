import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDown, ArrowUp, Bookmark, BookOpen, Copy, Dices, Download, Gauge, Hash, Layers,
  Lightbulb, List, Plus, RefreshCw, Search, Sparkles, Timer, Trash2, Wand2, X,
} from 'lucide-react'
import type { Section, SectionKind, Snippet, Song, Vibe } from '../types'
import { SECTION_LABELS, SECTION_OPTIONS, VIBE_OPTIONS, blankLine, blankSection } from '../types'
import {
  analyzePastedText, coachSong, coWrite, generateIdea, gameCheck, rateSong,
  type CowriteKind,
} from '../lib/analysis'
import {
  analyzeWord, collectFamilies, endWord, familyColorIndex, findRhymes, lineSyllables, scanLine,
} from '../lib/engine'
import { RHYME_GAME_WORDS, TOPICS } from '../lib/wordbank'
import {
  downloadSongJson, downloadSongLrc, downloadSongMarkdown, downloadSongPng, downloadSongTxt,
  printSong, shareSongPng, songToText,
} from '../lib/export'
import { IconButton, Segmented, Sheet } from './ui'

export type ToolTab =
  | 'rhyme' | 'syllables' | 'scheme' | 'flow' | 'coach' | 'rate'
  | 'cowrite' | 'practice' | 'ideas' | 'song' | 'vault' | 'structure'

interface Props {
  open: boolean
  initialTab: ToolTab
  song: Song
  vibe: Vibe
  dark: boolean
  snippets: Snippet[]
  onClose: () => void
  onUpdateSong: (song: Song) => void
  onNotify: (msg: string) => void
  onJumpToLine: (lineId: string) => void
  onAddSnippet: (text: string) => void
  onRemoveSnippet: (id: string) => void
}

const TABS: { id: ToolTab; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'rhyme', label: 'Rhyme finder', icon: <Search size={16} />, hint: 'Perfect, slant and multi rhymes' },
  { id: 'syllables', label: 'Syllable counter', icon: <Hash size={16} />, hint: 'Counts for every line' },
  { id: 'scheme', label: 'Rhyme scheme', icon: <List size={16} />, hint: 'Letters for every ending' },
  { id: 'flow', label: 'Flow & scansion', icon: <Activity size={16} />, hint: 'Stress marks and beat anchors' },
  { id: 'coach', label: 'Lyric coach', icon: <Wand2 size={16} />, hint: 'Clichés, filler, uneven bars' },
  { id: 'rate', label: 'Rate my rap', icon: <Gauge size={16} />, hint: 'Five scores out of ten' },
  { id: 'cowrite', label: 'Co-writer', icon: <Sparkles size={16} />, hint: 'Local spark engine' },
  { id: 'practice', label: 'Practice', icon: <Dices size={16} />, hint: 'Topics, freestyle, rhyme game' },
  { id: 'ideas', label: 'Song ideas', icon: <Lightbulb size={16} />, hint: 'Title, mood, images' },
  { id: 'song', label: 'Full song & export', icon: <BookOpen size={16} />, hint: 'Read it top to bottom' },
  { id: 'vault', label: 'Snippet vault', icon: <Bookmark size={16} />, hint: 'Bars you saved from any song' },
  { id: 'structure', label: 'Structure', icon: <Layers size={16} />, hint: 'Reorder verses and hooks' },
]

const songText = (song: Song) =>
  song.sections.map((s) => s.lines.map((l) => l.text).join('\n')).join('\n\n')

function dailyGameWord() {
  const d = new Date()
  const seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()
  return RHYME_GAME_WORDS[seed % RHYME_GAME_WORDS.length]
}

export default function Tools({
  open, initialTab, song, vibe, dark, snippets, onClose, onUpdateSong, onNotify, onJumpToLine,
  onAddSnippet, onRemoveSnippet,
}: Props) {
  const [tab, setTab] = useState<ToolTab>(initialTab)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  const copy = async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text)
      onNotify(label)
    } catch {
      onNotify('Copy is blocked in this browser')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} className="tools-sheet" label="Songwriting tools">
      <div className="tools-shell">
        <aside className="tools-nav">
          <div className="tools-nav-head">
            <span className="eyebrow">Studio tools</span>
            <h2>{song.title}</h2>
          </div>
          <div className="tools-nav-list">
            {TABS.map((t) => (
              <button key={t.id} className={`tools-nav-item ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <p className="tools-footnote">Everything here runs offline on this device.</p>
        </aside>
        <div className="tools-content">
          <div className="tools-topbar">
            <div>
              <span className="eyebrow">{TABS.find((t) => t.id === tab)?.hint}</span>
              <h2>{TABS.find((t) => t.id === tab)?.label}</h2>
            </div>
            <IconButton onClick={onClose} aria-label="Close tools"><X size={18} /></IconButton>
          </div>
          <div className="tools-body">
            {tab === 'rhyme' && <RhymeFinder song={song} onCopy={copy} />}
            {tab === 'syllables' && <SyllableTool song={song} onCopy={copy} />}
            {tab === 'scheme' && <SchemeTool song={song} />}
            {tab === 'flow' && <FlowTool song={song} />}
            {tab === 'coach' && <CoachTool song={song} onJumpToLine={onJumpToLine} onClose={onClose} />}
            {tab === 'rate' && <RateTool song={song} />}
            {tab === 'cowrite' && (
              <CowriteTool song={song} vibe={vibe} onUpdateSong={onUpdateSong} onNotify={onNotify} onCopy={copy} />
            )}
            {tab === 'practice' && <PracticeTool song={song} onUpdateSong={onUpdateSong} onNotify={onNotify} />}
            {tab === 'ideas' && <IdeasTool song={song} onUpdateSong={onUpdateSong} onNotify={onNotify} />}
            {tab === 'song' && (
              <SongTool
                song={song}
                dark={dark}
                onCopy={copy}
                onNotify={onNotify}
                onOpenStructure={() => setTab('structure')}
              />
            )}
            {tab === 'vault' && (
              <VaultTool
                song={song}
                snippets={snippets}
                onUpdateSong={onUpdateSong}
                onAddSnippet={onAddSnippet}
                onRemoveSnippet={onRemoveSnippet}
                onCopy={copy}
                onNotify={onNotify}
              />
            )}
            {tab === 'structure' && (
              <StructureTool song={song} onUpdateSong={onUpdateSong} onNotify={onNotify} />
            )}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

/* ------------------------------- rhyme finder ------------------------------ */

function RhymeFinder({ song, onCopy }: { song: Song; onCopy: (t: string, l?: string) => void }) {
  const lastLine = [...song.sections].reverse().flatMap((s) => s.lines).reverse().find((l) => l.text.trim())
  const seeded = lastLine ? endWord(lastLine.text) : 'time'
  const [query, setQuery] = useState(seeded)
  const [submitted, setSubmitted] = useState(seeded)
  const results = useMemo(() => findRhymes(submitted), [submitted])
  const [kind, setKind] = useState<'perfect' | 'multi' | 'slant'>('perfect')
  const list = kind === 'perfect' ? results.perfect : kind === 'multi' ? results.multi : results.slant

  const groups = useMemo(() => {
    const map = new Map<number, typeof list>()
    for (const entry of list) {
      const arr = map.get(entry.syllables) ?? []
      arr.push(entry)
      map.set(entry.syllables, arr)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [list])

  return (
    <div className="tool-pane">
      <form
        className="tool-search"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(query.trim())
        }}
      >
        <Search size={17} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a word to rhyme" aria-label="Rhyme word" />
        <button className="primary-btn sm" type="submit">Find rhymes</button>
      </form>
      <div className="kind-row">
        {(['perfect', 'multi', 'slant'] as const).map((k) => {
          const n = k === 'perfect' ? results.perfect.length : k === 'multi' ? results.multi.length : results.slant.length
          return (
            <button key={k} className={`kind-pill ${kind === k ? 'is-on' : ''}`} onClick={() => setKind(k)}>
              {k === 'perfect' ? 'Perfect' : k === 'multi' ? 'Multisyllabic' : 'Slant'}<span>{n}</span>
            </button>
          )
        })}
      </div>
      {groups.length ? (
        <div className="rhyme-groups">
          {groups.map(([syllables, entries]) => (
            <div key={syllables} className="rhyme-group">
              <h4>{syllables} syllable{syllables === 1 ? '' : 's'} <span>{entries.length}</span></h4>
              <div className="chip-cloud">
                {entries.map((r) => (
                  <button key={r.word} className="word-chip" onClick={() => onCopy(r.word, `Copied “${r.word}”`)} title="Copy">
                    {r.word}<sup>{r.syllables}</sup>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="word-empty">No rhymes found for “{submitted}”. Every word in the pronunciation dictionary was checked — try the multisyllabic tab or a different spelling.</p>
      )}
      <p className="tool-note">Tap a word to copy it. Double-click any word in the editor to drop a rhyme straight into the bar.</p>
    </div>
  )
}

/* -------------------------------- syllables -------------------------------- */

function SyllableTool({ song, onCopy }: { song: Song; onCopy: (t: string, l?: string) => void }) {
  const [text, setText] = useState(songText(song))
  const analysis = useMemo(() => analyzePastedText(text), [text])
  return (
    <div className="tool-pane">
      <textarea
        className="tool-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste lyrics here…"
        aria-label="Lyrics for syllable counting"
      />
      <div className="stat-row">
        <div className="stat"><em>{analysis.rows.length}</em><span>lines</span></div>
        <div className="stat"><em>{analysis.total}</em><span>syllables</span></div>
        <div className="stat"><em>{analysis.average.toFixed(1)}</em><span>avg / line</span></div>
        <button className="ghost-btn sm" onClick={() => onCopy(`${analysis.total} syllables across ${analysis.rows.length} lines`, 'Analysis copied')}>
          <Copy size={13} /> Copy
        </button>
      </div>
      <div className="analysis-list">
        {analysis.rows.map((row, i) => (
          <div className="analysis-row" key={i}>
            <span className="analysis-num">{String(i + 1).padStart(2, '0')}</span>
            <p>{row.text}</p>
            <span className={`analysis-count ${row.syllables >= 20 ? 'is-red' : row.syllables >= 16 ? 'is-amber' : ''}`}>{row.syllables}</span>
          </div>
        ))}
        {!analysis.rows.length && <p className="word-empty">Nothing to count yet.</p>}
      </div>
    </div>
  )
}

/* --------------------------------- scheme ---------------------------------- */

function SchemeTool({ song }: { song: Song }) {
  const [text, setText] = useState(songText(song))
  const analysis = useMemo(() => analyzePastedText(text), [text])
  return (
    <div className="tool-pane">
      <textarea className="tool-textarea" value={text} onChange={(e) => setText(e.target.value)} aria-label="Lyrics for rhyme scheme" />
      <div className="scheme-legend">
        <span>A</span> new rhyme <span>AA</span> same ending · letters follow first appearance
      </div>
      <div className="analysis-list">
        {analysis.rows.map((row, i) => (
          <div className="analysis-row" key={i}>
            <span className="analysis-num">{String(i + 1).padStart(2, '0')}</span>
            <p>{row.text}</p>
            <span className="scheme-letter">{row.letter}</span>
            <span className="analysis-count">{row.syllables}</span>
          </div>
        ))}
        {!analysis.rows.length && <p className="word-empty">Paste a verse above to see its scheme.</p>}
      </div>
    </div>
  )
}

/* ---------------------------------- coach ---------------------------------- */

function CoachTool({
  song, onJumpToLine, onClose,
}: { song: Song; onJumpToLine: (lineId: string) => void; onClose: () => void }) {
  const notes = useMemo(() => coachSong(song), [song])
  return (
    <div className="tool-pane">
      <p className="tool-lead">
        A read on your current draft: familiar phrases, repeated words, filler, uneven pockets
        and lines that rhyme with nothing. It is a second pair of eyes, not a grade.
      </p>
      <div className="note-list">
        {notes.map((note) => (
          <article key={note.id} className={`coach-note ${note.severity}`}>
            <div className="coach-dot" />
            <div>
              <h4>{note.title}</h4>
              <p>{note.detail}</p>
              {note.lineId && (
                <button className="link-btn" onClick={() => { onJumpToLine(note.lineId!); onClose() }}>
                  Jump to that bar
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------- rate ----------------------------------- */

function RateTool({ song }: { song: Song }) {
  const report = useMemo(() => rateSong(song), [song])
  return (
    <div className="tool-pane">
      <div className="overall">
        <div>
          <span className="eyebrow">Blueprint score</span>
          <div className="overall-num">{report.overall.toFixed(1)}<em>/10</em></div>
          <p>{report.bars} bars read · end rhymes, internals, multis, pocket and variety.</p>
        </div>
        <div className="overall-ring" style={{ ['--score' as string]: `${report.overall * 10}%` }}>
          <Gauge size={26} />
        </div>
      </div>
      <div className="score-list">
        {report.scores.map((s) => (
          <div key={s.key} className="score-row">
            <div className="score-top"><span>{s.label}</span><em>{s.value.toFixed(1)}</em></div>
            <div className="score-bar"><span style={{ width: `${s.value * 10}%` }} /></div>
            <p>{s.note}</p>
          </div>
        ))}
      </div>
      <p className="tool-note">
        RapPad's Blueprint grades after the fact; this reads live. Scores reward answered endings,
        sound echoes, multis and a steady pocket — not subject matter.
      </p>
    </div>
  )
}

/* -------------------------------- co-writer -------------------------------- */

const COWRITE_ACTIONS: { id: CowriteKind; label: string; hint: string }[] = [
  { id: 'complete', label: 'Complete it', hint: 'A bar that answers the one above' },
  { id: 'punch', label: 'The punch', hint: 'Short, sharper close' },
  { id: 'switch', label: 'Switch up', hint: 'Break the rhyme for a new direction' },
  { id: 'god', label: 'God prompt', hint: 'Three opening bars' },
  { id: 'rewrite', label: 'Rewrite harder', hint: 'Polish the current bar' },
]

function CowriteTool({
  song, vibe, onUpdateSong, onNotify, onCopy,
}: {
  song: Song
  vibe: Vibe
  onUpdateSong: (s: Song) => void
  onNotify: (m: string) => void
  onCopy: (t: string, l?: string) => void
}) {
  const [v, setV] = useState<Vibe>(vibe)
  const [kind, setKind] = useState<CowriteKind>('complete')
  const [sectionId, setSectionId] = useState(song.sections[0]?.id ?? '')
  const [draftText, setDraftText] = useState('')
  const [nonce, setNonce] = useState(0)
  const section = song.sections.find((s) => s.id === sectionId) ?? song.sections[0]
  const previous = section ? section.lines.map((l) => l.text).filter((t) => t.trim()) : []
  const options = useMemo(
    () => coWrite(kind, v, previous, draftText || previous[previous.length - 1] || ''),
    [kind, v, previous, draftText, nonce],
  )

  const addLine = (text: string) => {
    if (!section) return
    const sections = song.sections.map((s) =>
      s.id === section.id ? { ...s, lines: [...s.lines, blankLine(text)] } : s,
    )
    onUpdateSong({ ...song, sections })
    onNotify('Added to the song')
  }

  return (
    <div className="tool-pane">
      <p className="tool-lead">
        A local, offline spark engine. It rhymes against the pronunciation dictionary and your
        {v === 'lyrical' ? ' lyrical' : ` ${v}`} vibe; you decide what stays.
      </p>
      <div className="cowrite-controls">
        <label className="field">
          <span className="field-label">Vibe</span>
          <select className="select" value={v} onChange={(e) => setV(e.target.value as Vibe)}>
            {VIBE_OPTIONS.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Section</span>
          <select className="select" value={section?.id} onChange={(e) => setSectionId(e.target.value)}>
            {song.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
      </div>
      <div className="kind-row wrap">
        {COWRITE_ACTIONS.map((a) => (
          <button key={a.id} className={`kind-pill ${kind === a.id ? 'is-on' : ''}`} onClick={() => { setKind(a.id); setNonce((n) => n + 1) }}>
            {a.label}
          </button>
        ))}
      </div>
      <p className="tool-note">{COWRITE_ACTIONS.find((a) => a.id === kind)?.hint}</p>
      {(kind === 'rewrite') && (
        <textarea
          className="tool-textarea short"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Paste the bar you want reworked…"
        />
      )}
      <div className="spark-list">
        {options.length ? options.map((opt, i) => (
          <div className="spark-card" key={i}>
            <p>{opt}</p>
            <div>
              <button className="ghost-btn sm" onClick={() => addLine(opt)}><Plus size={12} /> Add as line</button>
              <button className="icon-mini" onClick={() => onCopy(opt, 'Line copied')} aria-label="Copy line"><Copy size={13} /></button>
            </div>
          </div>
        )) : (
          <p className="word-empty">Not enough context yet. Write a bar above, or pick a different section.</p>
        )}
      </div>
      <button className="ghost-btn sm" onClick={() => setNonce((n) => n + 1)}><RefreshCw size={13} /> New options</button>
    </div>
  )
}

/* -------------------------------- practice --------------------------------- */

function PracticeTool({
  song, onUpdateSong, onNotify,
}: { song: Song; onUpdateSong: (s: Song) => void; onNotify: (m: string) => void }) {
  const [mode, setMode] = useState<'topics' | 'freestyle' | 'game'>('topics')
  return (
    <div className="tool-pane">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'topics', label: 'Topic roller' },
          { value: 'freestyle', label: 'Freestyle' },
          { value: 'game', label: 'Rhyme game' },
        ]}
        ariaLabel="Practice mode"
      />
      {mode === 'topics' && <TopicRoller song={song} onUpdateSong={onUpdateSong} onNotify={onNotify} />}
      {mode === 'freestyle' && <Freestyle song={song} onUpdateSong={onUpdateSong} onNotify={onNotify} />}
      {mode === 'game' && <RhymeGame onNotify={onNotify} />}
    </div>
  )
}

function TopicRoller({
  song, onUpdateSong, onNotify,
}: { song: Song; onUpdateSong: (s: Song) => void; onNotify: (m: string) => void }) {
  const [topic, setTopic] = useState(() => TOPICS[Math.floor(Math.random() * TOPICS.length)])
  return (
    <div className="practice-pane">
      <div className="prompt-card">
        <span className="eyebrow">Write about</span>
        <h3>{topic.topic}</h3>
        <div className="keyword-row">
          {topic.keys.map((k) => <span key={k} className="chip is-static">{k}</span>)}
        </div>
      </div>
      <div className="button-row">
        <button className="ghost-btn" onClick={() => setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)])}>
          <Dices size={15} /> Roll again
        </button>
        <button
          className="primary-btn"
          onClick={() => {
            onUpdateSong({ ...song, topic: topic.topic, keywords: topic.keys })
            onNotify('Set as this song’s topic')
          }}
        >
          Use as song topic
        </button>
      </div>
      <p className="tool-note">The topic roller hands you a scene and five concrete words — enough to start, loose enough to bend.</p>
    </div>
  )
}

function Freestyle({
  song, onUpdateSong, onNotify,
}: { song: Song; onUpdateSong: (s: Song) => void; onNotify: (m: string) => void }) {
  const [topic, setTopic] = useState(() => TOPICS[Math.floor(Math.random() * TOPICS.length)])
  const [text, setText] = useState('')
  const [left, setLeft] = useState(60)
  const [running, setRunning] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!running) return
    timer.current = window.setInterval(() => {
      setLeft((t) => {
        if (t <= 1) {
          setRunning(false)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [running])

  const words = (text.match(/[A-Za-z0-9'’-]+/g) ?? []).length
  const syl = lineSyllables(text)

  const send = () => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => blankLine(l))
    if (!lines.length) return
    const section: Section = { ...blankSection('verse', 'Freestyle'), lines }
    onUpdateSong({ ...song, sections: [...song.sections, section] })
    onNotify('Freestyle added as a new section')
    setText('')
  }

  return (
    <div className="practice-pane">
      <div className="freestyle-head">
        <div>
          <span className="eyebrow">60-second freestyle</span>
          <h3>{topic.topic}</h3>
          <div className="keyword-row">{topic.keys.map((k) => <span key={k} className="chip is-static">{k}</span>)}</div>
        </div>
        <div className={`timer-badge ${left <= 10 && running ? 'is-hot' : ''}`}>
          <Timer size={14} /> {left}s
        </div>
      </div>
      <textarea
        className="tool-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="No backspace, no judgement. Just keep the pen moving…"
        onKeyDown={(e) => e.key === 'Enter' && e.metaKey && send()}
      />
      <div className="stat-row">
        <div className="stat"><em>{words}</em><span>words</span></div>
        <div className="stat"><em>{syl}</em><span>syllables</span></div>
        <div className="button-row">
          <button className="ghost-btn sm" onClick={() => { setLeft(60); setRunning(true); setText('') }}>
            <Timer size={13} /> {running ? 'Restart' : 'Start'}
          </button>
          <button className="ghost-btn sm" onClick={() => setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)])}>
            <Dices size={13} /> New prompt
          </button>
          <button className="primary-btn sm" onClick={send}>Send to song</button>
        </div>
      </div>
    </div>
  )
}

function RhymeGame({ onNotify }: { onNotify: (m: string) => void }) {
  const [word, setWord] = useState(dailyGameWord)
  const [input, setInput] = useState('')
  const [found, setFound] = useState<{ word: string; points: number; kind: string }[]>([])
  const [left, setLeft] = useState(60)
  const [running, setRunning] = useState(false)
  const [best, setBest] = useState(() => Number(localStorage.getItem('flowstate.game.best') ?? 0))
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!running) return
    timer.current = window.setInterval(() => {
      setLeft((t) => {
        if (t <= 1) {
          setRunning(false)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [running])

  const score = found.reduce((n, f) => n + f.points, 0)
  useEffect(() => {
    if (!running && score > best) {
      setBest(score)
      localStorage.setItem('flowstate.game.best', String(score))
    }
  }, [running, score, best])

  const submit = () => {
    if (!running) return
    const value = input.trim().toLowerCase()
    if (!value) return
    if (found.some((f) => f.word === value)) { onNotify('Already got that one'); return }
    const check = gameCheck(value, word)
    if (!check.ok) { onNotify(`“${value}” doesn't echo “${word}”`); return }
    setFound([...found, { word: value, points: check.points, kind: check.kind }])
    setInput('')
  }

  return (
    <div className="practice-pane">
      <div className="game-head">
        <div>
          <span className="eyebrow">Rhyme game · daily word</span>
          <h3>{word}</h3>
          <p className="tool-note">Type every rhyme you can find. Perfect = 10, slant = 6, multi = 15.</p>
        </div>
        <div className="game-score">
          <div><em>{score}</em><span>score</span></div>
          <div><em>{best}</em><span>best</span></div>
          <div className={left <= 10 && running ? 'is-hot' : ''}><em>{left}</em><span>sec</span></div>
        </div>
      </div>
      <form className="tool-search" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={running ? 'Type a rhyme…' : 'Press start'} disabled={!running} aria-label="Your rhyme" />
        <button className="primary-btn sm" type="submit" disabled={!running}>Score it</button>
        <button
          type="button"
          className="ghost-btn sm"
          onClick={() => { setLeft(60); setFound([]); setInput(''); setRunning(true) }}
        >
          {running ? 'Restart' : 'Start 60s'}
        </button>
      </form>
      <div className="found-list">
        {found.map((f) => (
          <span key={f.word} className={`found-chip ${f.kind}`}>{f.word}<em>+{f.points}</em></span>
        ))}
        {!found.length && <p className="word-empty">Nothing found yet. Slant rhymes count too.</p>}
      </div>
      <button className="ghost-btn sm" onClick={() => { setWord(RHYME_GAME_WORDS[Math.floor(Math.random() * RHYME_GAME_WORDS.length)]); setFound([]); setLeft(60); setRunning(false) }}>
        <RefreshCw size={13} /> New word
      </button>
    </div>
  )
}

/* ---------------------------------- ideas ---------------------------------- */

function IdeasTool({
  song, onUpdateSong, onNotify,
}: { song: Song; onUpdateSong: (s: Song) => void; onNotify: (m: string) => void }) {
  const [idea, setIdea] = useState(generateIdea)
  return (
    <div className="tool-pane">
      <div className="idea-card">
        <span className="eyebrow">Song idea</span>
        <h3>{idea.title}</h3>
        <div className="idea-grid">
          <div><span>Mood</span><p>{idea.mood}</p></div>
          <div><span>Genre</span><p>{idea.genre}</p></div>
          <div><span>Image</span><p>{idea.image}</p></div>
          <div><span>Move</span><p>{idea.move}</p></div>
        </div>
        <div className="keyword-row">{idea.keywords.map((k) => <span key={k} className="chip is-static">{k}</span>)}</div>
      </div>
      <div className="button-row">
        <button className="ghost-btn" onClick={() => setIdea(generateIdea())}><Dices size={15} /> Roll another</button>
        <button
          className="primary-btn"
          onClick={() => {
            onUpdateSong({ ...song, title: idea.title, topic: `${idea.mood} · ${idea.move}`, keywords: idea.keywords })
            onNotify('Idea applied to this song')
          }}
        >
          Use this idea
        </button>
      </div>
      <p className="tool-note">A title, a mood, an image, a move and five words — a seed, not a script.</p>
    </div>
  )
}

/* -------------------------------- full song -------------------------------- */

function SongTool({
  song, dark, onCopy, onNotify, onOpenStructure,
}: {
  song: Song
  dark: boolean
  onCopy: (t: string, l?: string) => void
  onNotify: (m: string) => void
  onOpenStructure: () => void
}) {
  const [busy, setBusy] = useState(false)
  const families = useMemo(
    () => collectFamilies(song.sections.flatMap((s) => s.lines.map((l) => l.text)), 'rap'),
    [song],
  )
  return (
    <div className="tool-pane">
      <div className="song-reader">
        <div className="reader-head">
          <div>
            <h3>{song.title}</h3>
            <span className="eyebrow">{song.vibe} · {song.bpm} BPM · {song.folder}</span>
          </div>
          <button className="ghost-btn sm" onClick={onOpenStructure}><Layers size={13} /> Structure</button>
        </div>
        {song.sections.map((section) => {
          const lines = section.lines.filter((l) => l.text.trim())
          if (!lines.length) return null
          return (
            <div className="reader-section" key={section.id}>
              <h4>{section.title}</h4>
              {section.lines.map((line) => {
                if (!line.text.trim()) return null
                return (
                  <p key={line.id} className="reader-line">
                    {line.text.split(/(\s+)/).map((part, i) => {
                      const core = part.replace(/^[^\w\d']+|[^\w\d']+$/g, '')
                      if (!core) return <span key={i}>{part}</span>
                      const info = analyzeWord(core)
                      const idx = familyColorIndex(info, 'rap', families)
                      return (
                        <span key={i} className={idx !== null ? 'rhyme-word' : undefined} data-color={idx !== null ? String(idx) : undefined}>
                          {part}
                        </span>
                      )
                    })}
                  </p>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="export-grid">
        <button className="ghost-btn" onClick={() => downloadSongTxt(song)}><Download size={15} /> Text file</button>
        <button className="ghost-btn" onClick={() => downloadSongMarkdown(song)}><Download size={15} /> Markdown</button>
        <button className="ghost-btn" onClick={() => downloadSongLrc(song)}><Download size={15} /> LRC timeline</button>
        <button className="ghost-btn" onClick={() => downloadSongJson(song)}><Download size={15} /> Song JSON</button>
        <button
          className="ghost-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try { await downloadSongPng(song, dark, false); onNotify('PNG saved') } catch { onNotify('Could not render PNG') }
            setBusy(false)
          }}
        >
          <Download size={15} /> Share image
        </button>
        <button
          className="ghost-btn"
          disabled={busy}
          onClick={async () => {
            try {
              const result = await shareSongPng(song, dark)
              onNotify(result === 'shared' ? 'Shared' : 'Image downloaded')
            } catch { onNotify('Could not share the image') }
          }}
        >
          <Download size={15} /> Share sheet
        </button>
        <button className="ghost-btn" onClick={() => { printSong(song); onNotify('Opening print view') }}>
          <BookOpen size={15} /> Print / PDF
        </button>
        <button className="ghost-btn" onClick={() => onCopy(songToText(song), 'Lyrics copied')}>
          <Copy size={15} /> Copy lyrics
        </button>
      </div>
      <p className="tool-note">The share image is 1080 × 1350, ready for a story or a group chat.</p>
    </div>
  )
}

/* -------------------------------- structure -------------------------------- */

function StructureTool({
  song, onUpdateSong, onNotify,
}: { song: Song; onUpdateSong: (s: Song) => void; onNotify: (m: string) => void }) {
  const [drag, setDrag] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= song.sections.length) return
    const sections = [...song.sections]
    const [item] = sections.splice(from, 1)
    sections.splice(to, 0, item)
    onUpdateSong({ ...song, sections })
  }

  const updateSection = (id: string, patch: Partial<Section>) => {
    onUpdateSong({
      ...song,
      sections: song.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  }

  const addSection = (kind: SectionKind) => {
    const count = song.sections.filter((s) => s.kind === kind).length + 1
    const section = blankSection(kind, `${SECTION_LABELS[kind]}${kind === 'verse' || kind === 'hook' ? ` ${count}` : ''}`)
    onUpdateSong({ ...song, sections: [...song.sections, section] })
    onNotify('Section added')
  }

  const deleteSection = (id: string) => {
    if (song.sections.length <= 1) { onNotify('Keep at least one section'); return }
    if (pendingDelete !== id) { setPendingDelete(id); return }
    onUpdateSong({ ...song, sections: song.sections.filter((s) => s.id !== id) })
    setPendingDelete(null)
    onNotify('Section deleted')
  }

  return (
    <div className="tool-pane">
      <p className="tool-lead">Drag a section or use the arrows. Whole verses and hooks move without rewriting a bar.</p>
      <div className="structure-list">
        {song.sections.map((section, index) => (
          <div
            key={section.id}
            className={`structure-row ${drag === section.id ? 'is-dragging' : ''}`}
            draggable
            onDragStart={() => setDrag(section.id)}
            onDragEnd={() => setDrag(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!drag) return
              const from = song.sections.findIndex((s) => s.id === drag)
              if (from !== -1 && from !== index) move(from, index)
              setDrag(null)
            }}
          >
            <span className="drag-handle" aria-hidden>⋮⋮</span>
            <div className="structure-fields">
              <input
                className="section-title-input"
                value={section.title}
                onChange={(e) => updateSection(section.id, { title: e.target.value })}
                aria-label="Section title"
              />
              <div className="structure-meta">
                <select
                  className="select xs"
                  value={section.kind}
                  onChange={(e) => updateSection(section.id, { kind: e.target.value as SectionKind })}
                  aria-label="Section kind"
                >
                  {SECTION_OPTIONS.map((k) => <option key={k} value={k}>{SECTION_LABELS[k]}</option>)}
                </select>
                <span>{section.lines.filter((l) => l.text.trim()).length} bars</span>
                <label className="target-field">
                  target
                  <input
                    type="number"
                    min={4}
                    max={32}
                    value={section.target}
                    onChange={(e) => updateSection(section.id, { target: Number(e.target.value) || 12 })}
                  />
                </label>
              </div>
            </div>
            <div className="structure-actions">
              <button className="icon-mini" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={13} /></button>
              <button className="icon-mini" onClick={() => move(index, index + 1)} disabled={index === song.sections.length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
              <button
                className={`icon-mini danger ${pendingDelete === section.id ? 'is-armed' : ''}`}
                onClick={() => deleteSection(section.id)}
                aria-label="Delete section"
                title={pendingDelete === section.id ? 'Tap again to delete' : 'Delete section'}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="button-row">
        <span className="field-label">Add section</span>
        {SECTION_OPTIONS.map((k) => (
          <button key={k} className="chip" onClick={() => addSection(k)}>+ {SECTION_LABELS[k]}</button>
        ))}
      </div>
      <p className="tool-note">Structure changes save instantly. Lines can still be edited in the writing view.</p>
    </div>
  )
}

/* ----------------------------------- flow ---------------------------------- */

function FlowTool({ song }: { song: Song }) {
  const rows = useMemo(() => {
    const out: { id: string; section: string; text: string; scan: ReturnType<typeof scanLine> }[] = []
    song.sections.forEach((section) => {
      section.lines.forEach((line) => {
        if (line.text.trim()) {
          out.push({ id: line.id, section: section.title, text: line.text, scan: scanLine(line.text) })
        }
      })
    })
    return out
  }, [song])

  const syllables = rows.reduce((n, row) => n + row.scan.syllables.length, 0)
  const onBeat = rows.reduce((n, row) => n + row.scan.onBeat, 0)
  const beatSlots = rows.reduce((n, row) => n + row.scan.beatSlots, 0)
  const guessed = rows.reduce((n, row) => n + row.scan.guessedWords.length, 0)
  const lock = beatSlots ? Math.round((onBeat / beatSlots) * 100) : 0

  return (
    <div className="tool-pane">
      <p className="tool-lead">
        Scansion from the CMU stress digits. Every mark is one syllable: filled is stressed,
        open is unstressed, and a faint rule every four syllables marks the beat.
      </p>

      <div className="stat-row">
        <div className="stat"><em>{syllables}</em><span>syllables</span></div>
        <div className="stat"><em>{rows.length}</em><span>bars</span></div>
        <div className="stat"><em>{lock}%</em><span>stress on beat</span></div>
      </div>

      {rows.length === 0 ? (
        <p className="word-empty">Write a few bars and their stress pattern appears here.</p>
      ) : (
        <div className="flow-list">
          {rows.map((row) => (
            <div className="flow-row" key={row.id}>
              <div className="flow-head">
                <span className="flow-section">{row.section}</span>
                <span className="flow-count">
                  {row.scan.syllables.length} syl · {row.scan.onBeat}/{row.scan.beatSlots} on beat
                </span>
              </div>
              <p className="flow-line">{row.text}</p>
              <div className="flow-marks" aria-hidden>
                {row.scan.syllables.map((syllable, index) => (
                  <span
                    key={index}
                    className={[
                      'stress-mark',
                      syllable.stress === 1 ? 'is-stressed' : '',
                      syllable.stress === 2 ? 'is-secondary' : '',
                      index % 4 === 0 ? 'is-beat' : '',
                      syllable.guessed ? 'is-guessed' : '',
                    ].filter(Boolean).join(' ')}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="tool-note">
        Stresses landing on the beat anchor (every fourth syllable) make a line feel locked in;
        stresses that fall between them read as swing or triplets.
        {guessed > 0 && ` ${guessed} word${guessed === 1 ? '' : 's'} had no dictionary entry — marks are guessed and shown hollow.`}
      </p>
    </div>
  )
}

/* ---------------------------------- vault ---------------------------------- */

function VaultTool({
  song, snippets, onUpdateSong, onAddSnippet, onRemoveSnippet, onCopy, onNotify,
}: {
  song: Song
  snippets: Snippet[]
  onUpdateSong: (song: Song) => void
  onAddSnippet: (text: string) => void
  onRemoveSnippet: (id: string) => void
  onCopy: (text: string, label?: string) => void
  onNotify: (message: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return snippets
    return snippets.filter(
      (snippet) =>
        snippet.text.toLowerCase().includes(needle) ||
        (snippet.source ?? '').toLowerCase().includes(needle),
    )
  }, [snippets, query])

  const appendToSong = (text: string) => {
    const last = song.sections[song.sections.length - 1]
    if (!last) return
    onUpdateSong({
      ...song,
      sections: song.sections.map((section) =>
        section.id === last.id ? { ...section, lines: [...section.lines, blankLine(text)] } : section,
      ),
    })
    onNotify('Added as a new bar')
  }

  return (
    <div className="tool-pane">
      <p className="tool-lead">
        A drawer of lines worth keeping. Save a bar from any song with the bookmark button under
        it, then pull it into whatever you are writing now.
      </p>

      <div className="vault-compose">
        <textarea
          className="tool-textarea short"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="A line, a hook, a phrase you don't want to lose…"
          aria-label="New snippet"
        />
        <div className="button-row">
          <button className="primary-btn sm" disabled={!draft.trim()} onClick={() => { onAddSnippet(draft); setDraft('') }}>
            <Plus size={13} /> Save snippet
          </button>
          <span className="tool-note">{snippets.length} saved</span>
        </div>
      </div>

      {snippets.length > 6 && (
        <label className="tool-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the vault" aria-label="Search snippets" />
        </label>
      )}

      {visible.length === 0 ? (
        <p className="word-empty">
          {snippets.length === 0
            ? 'Nothing saved yet. Bookmark a bar in the editor, or paste one above.'
            : 'No snippets match that search.'}
        </p>
      ) : (
        <div className="vault-list">
          {visible.map((snippet) => (
            <article className="vault-card" key={snippet.id}>
              <p>{snippet.text}</p>
              <div className="vault-foot">
                <span>{snippet.source ? `from ${snippet.source}` : 'vault'}</span>
                <div>
                  <button className="ghost-btn sm" onClick={() => appendToSong(snippet.text)}>
                    <Plus size={12} /> Add as bar
                  </button>
                  <button className="icon-mini" onClick={() => onCopy(snippet.text, 'Snippet copied')} aria-label="Copy snippet">
                    <Copy size={13} />
                  </button>
                  <button className="icon-mini danger" onClick={() => onRemoveSnippet(snippet.id)} aria-label="Delete snippet">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="tool-note">The vault travels with your library in the JSON backup.</p>
    </div>
  )
}
