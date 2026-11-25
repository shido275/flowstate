import { useEffect, useRef, useState } from 'react'
import { FlipHorizontal2, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react'
import type { Settings, Song } from '../types'
import { IconButton } from './ui'

interface Props {
  song: Song
  settings: Settings
  onClose: () => void
}

export default function Teleprompter({ song, settings, onClose }: Props) {
  const [size, setSize] = useState(settings.teleprompterSize)
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(true)
  const [mirror, setMirror] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const el = scroller.current
      if (el && playing) {
        const pxPerSecond = (settings.bpm / 60) * size * 0.72 * speed
        el.scrollTop += pxPerSecond * dt
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setPlaying(false)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, size, settings.bpm])

  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (type: string) => Promise<{ release?: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => undefined)
    return () => { void lock?.release?.() }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const bump = (delta: number) => setSize((s) => Math.max(18, Math.min(72, s + delta)))

  return (
    <div className="prompter">
      <div className="prompter-top">
        <div>
          <span className="eyebrow">Booth teleprompter</span>
          <h2>{song.title}</h2>
        </div>
        <IconButton onClick={onClose} aria-label="Close teleprompter"><X size={19} /></IconButton>
      </div>

      <div
        className="prompter-scroll"
        ref={scroller}
        onClick={(e) => {
          if (e.target instanceof HTMLElement && e.target.closest('button')) return
          setPlaying((p) => !p)
        }}
      >
        <div
          className={`prompter-inner ${mirror ? 'is-mirrored' : ''}`}
          style={{ fontSize: `${size}px` }}
        >
          {song.sections.map((section) => {
            const lines = section.lines.filter((l) => l.text.trim())
            if (!lines.length) return null
            return (
              <div className="prompter-section" key={section.id}>
                <h3>{section.title}</h3>
                {lines.map((line) => <p key={line.id}>{line.text}</p>)}
              </div>
            )
          })}
          <div className="prompter-end">— end —</div>
        </div>
      </div>

      <div className="prompter-dock">
        <div className="prompter-bpm">
          <span>{settings.bpm} BPM</span>
          <em>{Math.round(speed * 100)}%</em>
        </div>
        <label className="prompter-range">
          speed
          <input type="range" min={0.3} max={2.5} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
        </label>
        <div className="prompter-size">
          <button onClick={() => bump(-2)} aria-label="Smaller text"><Minus size={14} /></button>
          <span>{size}px</span>
          <button onClick={() => bump(2)} aria-label="Bigger text"><Plus size={14} /></button>
        </div>
        <button className="prompter-btn" onClick={() => { if (scroller.current) scroller.current.scrollTop = 0; setPlaying(true) }}>
          <RotateCcw size={15} /> Restart
        </button>
        <button className="prompter-btn" onClick={() => setMirror((m) => !m)}>
          <FlipHorizontal2 size={15} /> Mirror
        </button>
        <button className={`prompter-play ${playing ? 'is-on' : ''}`} onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
          {playing ? 'Pause' : 'Scroll'}
        </button>
      </div>
    </div>
  )
}
