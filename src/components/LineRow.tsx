import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Bookmark, Layers, Mic, Play, Sparkles, Square, Trash2, X,
} from 'lucide-react'
import type { Line, Settings, Song } from '../types'
import { uid } from '../types'
import {
  analyzeWord, endWord, familyColorIndex, findRhymes, lineSyllables,
  tokenizeLine, type FamilyInfo,
} from '../lib/engine'
import { coWrite } from '../lib/analysis'
import { createRecorder, type RecorderHandle } from '../lib/audio'
import { deleteTakeBlob, deviceId, getTakeBlob, putTakeBlob } from '../lib/storage'
import { SyllableGlyph } from './ui'

export interface WordTarget {
  lineId: string
  sectionId: string
  word: string
  start: number
  end: number
}

interface Props {
  line: Line
  index: number
  sectionId: string
  song: Song
  settings: Settings
  families: FamilyInfo
  prevText: string
  schemeLetter: string | null
  avgSyllables: number
  maxSyllables: number
  active: boolean
  registerRef: (id: string, el: HTMLTextAreaElement | null) => void
  onFocus: () => void
  onChangeText: (text: string) => void
  onUpdateLine: (patch: Partial<Line>) => void
  onSplit: (start: number, end: number) => void
  onPasteLines: (lines: string[]) => void
  onDeleteEmpty: () => void
  onNavigate: (dir: -1 | 1) => void
  onOpenWord: (target: WordTarget) => void
  onDelete: () => void
  onSaveToVault: () => void
  onNotify: (msg: string) => void
}

function useAutoSize(text: string, fontScale: number) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const lastWidth = useRef(0)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useLayoutEffect(fit, [text, fontScale])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    lastWidth.current = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth.current) {
        lastWidth.current = el.clientWidth
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return ref
}

export default function LineRow({
  line, index, sectionId, song, settings, families, prevText, schemeLetter,
  avgSyllables, maxSyllables, active, registerRef, onFocus, onChangeText,
  onUpdateLine, onSplit, onPasteLines, onDeleteEmpty, onNavigate, onOpenWord,
  onDelete, onSaveToVault, onNotify,
}: Props) {
  const taRef = useAutoSize(line.text, settings.fontScale)
  const [draftsOpen, setDraftsOpen] = useState(false)
  const [takesOpen, setTakesOpen] = useState(false)
  const [sparkOpen, setSparkOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [ghostIdx, setGhostIdx] = useState(0)
  const recorderRef = useRef<RecorderHandle | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const syllables = useMemo(() => lineSyllables(line.text), [line.text])
  const tokens = useMemo(() => tokenizeLine(line.text), [line.text])
  const deviation = avgSyllables ? Math.abs(syllables - avgSyllables) : 0
  const countClass = line.text.trim()
    ? deviation >= 6 ? 'is-red' : deviation >= 4 ? 'is-amber' : ''
    : ''
  const max = Math.max(maxSyllables, 1)

  const ghosts = useMemo(() => {
    if (line.text || !settings.ghostRhymes) return []
    const w = endWord(prevText)
    if (!w) return []
    const r = findRhymes(w)
    return [...r.perfect.slice(0, 3), ...r.slant.slice(0, 3)].map((e) => e.word)
  }, [line.text, prevText, settings.ghostRhymes])

  const ghostText = useMemo(() => {
    if (line.text) return ''
    if (ghosts.length) {
      const a = ghosts[ghostIdx % ghosts.length]
      const b = ghosts[(ghostIdx + 1) % ghosts.length]
      return `${a} · ${b}`
    }
    return 'Write a bar…'
  }, [ghosts, ghostIdx, line.text])

  useEffect(() => {
    if (!ghosts.length) return
    const t = window.setInterval(() => setGhostIdx((i) => i + 1), 3800)
    return () => window.clearInterval(t)
  }, [ghosts.length])

  useEffect(() => {
    if (!recording) return
    const start = recorderRef.current?.startedAt ?? performance.now()
    const t = window.setInterval(() => setElapsed(performance.now() - start), 120)
    return () => window.clearInterval(t)
  }, [recording])

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
      audioRef.current?.pause()
    }
  }, [])

  const stopPlayback = () => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
  }

  const toggleRecord = async () => {
    if (!recording) {
      try {
        stopPlayback()
        recorderRef.current = await createRecorder()
        setElapsed(0)
        setRecording(true)
      } catch {
        onNotify('Microphone access is needed to record a take')
      }
      return
    }
    const rec = recorderRef.current
    if (!rec) return
    setRecording(false)
    const { blob, duration } = await rec.stop()
    recorderRef.current = null
    if (blob.size < 600) {
      onNotify('That take was too short to keep')
      return
    }
    const id = uid()
    try {
      await putTakeBlob(id, blob)
      onUpdateLine({
        takes: [
          ...line.takes,
          {
            id,
            name: `Take ${String(line.takes.length + 1).padStart(2, '0')}`,
            duration,
            createdAt: Date.now(),
            device: deviceId(),
          },
        ],
      })
      setTakesOpen(true)
      onNotify('Take saved on this device')
    } catch {
      onNotify('Could not save that take')
    }
  }

  const playTake = async (takeId: string) => {
    if (playingId === takeId) {
      stopPlayback()
      return
    }
    stopPlayback()
    const blob = await getTakeBlob(takeId)
    if (!blob) {
      const take = line.takes.find((t) => t.id === takeId)
      onNotify(
        take?.device && take.device !== deviceId()
          ? 'That take was recorded on another device, so its audio is not here'
          : 'That audio is missing from this device',
      )
      return
    }
    const audio = new Audio(URL.createObjectURL(blob))
    audioRef.current = audio
    setPlayingId(takeId)
    audio.onended = () => setPlayingId(null)
    audio.play().catch(() => onNotify('Could not play that take'))
  }

  const removeTake = async (takeId: string) => {
    if (playingId === takeId) stopPlayback()
    await deleteTakeBlob(takeId).catch(() => undefined)
    onUpdateLine({ takes: line.takes.filter((t) => t.id !== takeId) })
  }

  const saveDraft = () => {
    if (!line.text.trim()) return
    if (line.drafts.includes(line.text)) return
    onUpdateLine({ drafts: [line.text, ...line.drafts].slice(0, 12) })
  }

  const useDraft = (draft: string) => {
    const old = line.text
    const drafts = line.drafts.filter((d) => d !== draft)
    if (old.trim() && !drafts.includes(old)) drafts.unshift(old)
    onUpdateLine({ text: draft, drafts: drafts.slice(0, 12) })
    setDraftsOpen(false)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  const sparkOptions = useMemo(
    () => (sparkOpen ? coWrite('rewrite', song.vibe, [prevText], line.text) : []),
    [sparkOpen, song.vibe, prevText, line.text],
  )

  const openWord = () => {
    const el = taRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = line.text
    let ws = start
    let we = end
    while (ws > 0 && /[\w'’-]/.test(text[ws - 1])) ws--
    while (we < text.length && /[\w'’-]/.test(text[we])) we++
    const word = text.slice(ws, we).replace(/[’]/g, "'").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9']+$/g, '')
    if (!word) return
    onOpenWord({ lineId: line.id, sectionId, word, start: ws, end: we })
  }

  const hasExtras = line.drafts.length > 0 || line.takes.length > 0

  return (
    <div className={`line ${active ? 'is-active' : ''}`} data-line-id={line.id}>
      <span className="line-index" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
      <div className="line-main">
        <div className="line-field">
          <div className="line-highlight" aria-hidden>
            {tokens.map((t, i) => {
              if (!t.word) return <span key={i}>{t.text}</span>
              const info = analyzeWord(t.word)
              const idx = familyColorIndex(info, settings.rhymeMode, families)
              return (
                <span
                  key={i}
                  className={idx !== null ? 'rhyme-word' : undefined}
                  data-color={idx !== null ? String(idx) : undefined}
                >
                  {t.text}
                </span>
              )
            })}
            {!line.text && (
              <span className={`line-ghost ${ghosts.length ? 'is-rhyme' : ''}`}>{ghostText}</span>
            )}
          </div>
          <textarea
            ref={(el) => {
              taRef.current = el
              registerRef(line.id, el)
            }}
            value={line.text}
            rows={1}
            spellCheck
            autoCapitalize="sentences"
            aria-label={`Bar ${index + 1}`}
            onChange={(e) => onChangeText(e.target.value)}
            onFocus={onFocus}
            onDoubleClick={openWord}
            onKeyDown={(e) => {
              const el = e.currentTarget
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSplit(el.selectionStart, el.selectionEnd)
              } else if (e.key === 'Backspace' && !line.text && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                onDeleteEmpty()
              } else if (e.key === 'ArrowUp' && el.selectionStart === 0) {
                e.preventDefault()
                onNavigate(-1)
              } else if (e.key === 'ArrowDown' && el.selectionStart === el.value.length) {
                e.preventDefault()
                onNavigate(1)
              } else if (e.key === 'Escape') {
                setDraftsOpen(false)
                setTakesOpen(false)
                setSparkOpen(false)
                el.blur()
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (/\r?\n/.test(text)) {
                e.preventDefault()
                onPasteLines(text.split(/\r?\n/))
              }
            }}
          />
        </div>

        {settings.showBeatGrid && line.text.trim() && (
          <div className="beat-grid" aria-hidden>
            <span
              className={`beat-fill ${countClass}`}
              style={{ width: `${Math.min(100, Math.max(6, (syllables / max) * 100))}%` }}
            />
          </div>
        )}

        {(active || hasExtras) && (
          <div className="line-tools">
            <button className="line-tool" onClick={toggleRecord} title="Record a take on this bar" aria-label="Record a take">
              {recording ? <Square size={13} className="recording-icon" /> : <Mic size={13} />}
              {recording && <span className="rec-time">{Math.floor(elapsed / 1000)}s</span>}
            </button>
            <button className="line-tool" onClick={() => { setDraftsOpen((v) => !v); setTakesOpen(false); setSparkOpen(false) }} title="Drafts on this bar">
              <Layers size={13} />
              {line.drafts.length > 0 && <span className="tool-count">{line.drafts.length}</span>}
            </button>
            <button className="line-tool" onClick={() => { setTakesOpen((v) => !v); setDraftsOpen(false); setSparkOpen(false) }} title="Takes on this bar">
              <Play size={12} />
              {line.takes.length > 0 && <span className="tool-count">{line.takes.length}</span>}
            </button>
            <button className="line-tool" onClick={() => { setSparkOpen((v) => !v); setDraftsOpen(false); setTakesOpen(false) }} title="Co-writer suggestions">
              <Sparkles size={13} />
            </button>
            <button
              className="line-tool"
              onClick={onSaveToVault}
              disabled={!line.text.trim()}
              title="Save this bar to your snippet vault"
              aria-label="Save bar to vault"
            >
              <Bookmark size={13} />
            </button>
            <button className="line-tool danger" onClick={onDelete} title="Delete bar" aria-label="Delete bar">
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {sparkOpen && (
          <div className="line-pop spark-pop">
            <div className="pop-head">
              <span><Sparkles size={13} /> Local co-writer</span>
              <button onClick={() => setSparkOpen(false)} aria-label="Close"><X size={14} /></button>
            </div>
            {sparkOptions.length ? (
              <>
                <p className="pop-hint">Rewrites in your {song.vibe} vibe. The original is kept as a draft.</p>
                {sparkOptions.map((opt, i) => (
                  <button
                    key={i}
                    className="spark-option"
                    onClick={() => {
                      saveDraft()
                      onUpdateLine({ text: opt })
                      setSparkOpen(false)
                      requestAnimationFrame(() => taRef.current?.focus())
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </>
            ) : (
              <p className="pop-hint">Nothing to rewrite yet. Write a bar first, or use the full co-writer in Tools.</p>
            )}
          </div>
        )}

        {draftsOpen && (
          <div className="line-pop">
            <div className="pop-head">
              <span><Layers size={13} /> Drafts</span>
              <button onClick={() => setDraftsOpen(false)} aria-label="Close drafts"><X size={14} /></button>
            </div>
            <div className="draft-current">
              <em>Current</em>
              <p>{line.text || 'Empty bar'}</p>
            </div>
            <button className="ghost-btn sm" onClick={saveDraft} disabled={!line.text.trim()}>
              Save current as a draft
            </button>
            {line.drafts.length === 0 && <p className="pop-hint">No drafts yet. Keep two versions of the same bar without losing either.</p>}
            {line.drafts.map((d, i) => (
              <div className="draft-row" key={`${d}-${i}`}>
                <p>{d}</p>
                <div>
                  <button className="link-btn" onClick={() => useDraft(d)}>Use</button>
                  <button
                    className="icon-mini"
                    onClick={() => onUpdateLine({ drafts: line.drafts.filter((_, j) => j !== i) })}
                    aria-label="Remove draft"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {takesOpen && (
          <div className="line-pop">
            <div className="pop-head">
              <span><Mic size={13} /> Takes on this bar</span>
              <button onClick={() => setTakesOpen(false)} aria-label="Close takes"><X size={14} /></button>
            </div>
            <button className={`ghost-btn sm ${recording ? 'is-recording' : ''}`} onClick={toggleRecord}>
              {recording ? <><Square size={12} /> Stop &amp; save ({Math.floor(elapsed / 1000)}s)</> : <><Mic size={13} /> Record a take</>}
            </button>
            {line.takes.length === 0 && <p className="pop-hint">Takes live on this device and stay attached to this bar.</p>}
            {line.takes.map((take) => (
              <div className="take-row" key={take.id}>
                <button className="take-play" onClick={() => playTake(take.id)} aria-label="Play take">
                  {playingId === take.id ? <Square size={11} /> : <Play size={12} />}
                </button>
                <input
                  className="take-name"
                  value={take.name}
                  onChange={(e) =>
                    onUpdateLine({
                      takes: line.takes.map((t) => (t.id === take.id ? { ...t, name: e.target.value } : t)),
                    })
                  }
                  aria-label="Take name"
                />
                <span className="take-time">{Math.round(take.duration / 1000)}s</span>
                {take.device && take.device !== deviceId() && (
                  <span
                    className="take-origin"
                    title="Recorded on another device; the audio stayed there"
                  >
                    elsewhere
                  </span>
                )}
                <button className="icon-mini danger" onClick={() => removeTake(take.id)} aria-label="Delete take">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="line-metrics" title={`${syllables} syllables${schemeLetter ? ` · rhyme ${schemeLetter}` : ''}`}>
        {settings.showSyllables ? <SyllableGlyph count={syllables} active={active} /> : null}
        <span className={`syl-count ${countClass}`}>
          {line.text.trim() ? syllables : ''}
          {settings.showRhymeLetters && line.text.trim() && schemeLetter ? <em>{schemeLetter}</em> : null}
        </span>
      </div>
    </div>
  )
}
