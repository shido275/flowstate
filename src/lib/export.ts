import type { AppState, Song } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { normalizeState } from './storage'
import {
  RHYME_PALETTE_DARK,
  RHYME_PALETTE_LIGHT,
  analyzeWord,
  collectFamilies,
  familyColorIndex,
} from './engine'

export function downloadBlob(blob: Blob, filename: string) {
  // A desktop shell has no download shelf, so the bytes go to the main process
  // and come back as a Save dialog instead of a silent drop.
  const bridge = window.flowstate
  if (bridge) {
    void blob
      .arrayBuffer()
      .then((data) => bridge.saveFile({ suggestedName: filename, mimeType: blob.type, data }))
      .then((result) => {
        if (!result.ok) console.error(`[flowstate] could not save ${filename}: ${result.reason ?? 'unknown'}`)
      })
      .catch((error) => console.error(`[flowstate] could not save ${filename}`, error))
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

const safeName = (title: string) =>
  (title.trim() || 'untitled-song').replace(/[^\w\d\- ]+/g, '').replace(/\s+/g, '-').toLowerCase()

export function songToText(song: Song): string {
  const out: string[] = [song.title, '']
  if (song.topic) out.push(`Topic: ${song.topic}`)
  out.push(`${song.sections.length} parts · ${song.bpm} BPM · free & open source`, '')
  for (const section of song.sections) {
    const lines = section.lines.map((l) => l.text.trimEnd()).filter((l) => l.trim())
    if (!lines.length) continue
    out.push(`[${section.title.toUpperCase()}]`)
    out.push(...lines)
    out.push('')
  }
  out.push('— written in Flowstate')
  return out.join('\n')
}

export function downloadSongTxt(song: Song) {
  downloadBlob(new Blob([songToText(song)], { type: 'text/plain;charset=utf-8' }), `${safeName(song.title)}.txt`)
}

export function songToMarkdown(song: Song): string {
  const out: string[] = [`# ${song.title}`, '']
  out.push(`*${song.vibe} · ${song.bpm} BPM · ${song.folder}*`, '')
  if (song.topic) out.push(`> ${song.topic}`, '')
  for (const section of song.sections) {
    const lines = section.lines.map((l) => l.text.trim()).filter(Boolean)
    if (!lines.length) continue
    out.push(`## ${section.title}`, '')
    out.push(...lines.map((line) => `${line}  `))
    out.push('')
  }
  out.push('---', '', 'Written in Flowstate — free & open source.')
  return out.join('\n')
}

/** One bar per timestamp, at four beats a bar — a useful draft, not a sync map. */
export function songToLrc(song: Song): string {
  const beatMs = 60_000 / Math.max(40, song.bpm)
  const stamp = (ms: number) => {
    const minutes = Math.floor(ms / 60_000)
    const seconds = Math.floor((ms % 60_000) / 1000)
    const centis = Math.floor((ms % 1000) / 10)
    return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}]`
  }
  const out = [`[ti:${song.title}]`, '[ar:Flowstate]', '[offset:0]']
  let at = 0
  for (const section of song.sections) {
    for (const line of section.lines) {
      const text = line.text.trim()
      if (!text) continue
      out.push(`${stamp(at)}${text}`)
      at += beatMs * 4
    }
    at += beatMs * 4
  }
  return out.join('\n')
}

export function songToJson(song: Song): string {
  return JSON.stringify(
    { app: 'flowstate', kind: 'song', exportedAt: Date.now(), song },
    null,
    2,
  )
}

export function downloadSongMarkdown(song: Song) {
  downloadBlob(new Blob([songToMarkdown(song)], { type: 'text/markdown;charset=utf-8' }), `${safeName(song.title)}.md`)
}

export function downloadSongLrc(song: Song) {
  downloadBlob(new Blob([songToLrc(song)], { type: 'text/plain;charset=utf-8' }), `${safeName(song.title)}.lrc`)
}

export function downloadSongJson(song: Song) {
  downloadBlob(new Blob([songToJson(song)], { type: 'application/json' }), `${safeName(song.title)}.json`)
}

export function downloadBackup(state: AppState) {
  const payload = JSON.stringify({ app: 'flowstate', exportedAt: Date.now(), ...state }, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  downloadBlob(new Blob([payload], { type: 'application/json' }), `flowstate-backup-${date}.json`)
}

export function parseBackup(text: string): AppState {
  const raw = JSON.parse(text) as Partial<AppState> & { songs?: Song[] }
  if (!raw || !Array.isArray(raw.songs)) throw new Error('That file does not look like a Flowstate backup.')
  const state = normalizeState(raw)
  return {
    ...state,
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
  }
}

/* ------------------------------- PNG share -------------------------------- */

const PAPER = {
  light: { bg: '#f8f4ed', ink: '#2c2b33', muted: '#8a8792', line: 'rgba(60,55,50,0.14)', accent: '#1aa88f' },
  dark: { bg: '#17171c', ink: '#f0ece4', muted: '#9b98a4', line: 'rgba(255,255,255,0.13)', accent: '#4bd1b4' },
}

interface PlacedWord {
  text: string
  color: string
  x: number
  width: number
}

export async function renderSongPng(song: Song, dark = false, square = false): Promise<Blob> {
  await document.fonts.ready
  const W = 1080
  const H = square ? 1080 : 1350
  const pad = 92
  const palette = dark ? PAPER.dark : PAPER.light
  const rhymeColors = dark ? RHYME_PALETTE_DARK : RHYME_PALETTE_LIGHT
  const families = collectFamilies(
    song.sections.flatMap((s) => s.lines.map((l) => l.text)),
    'rap',
  )

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const lettered = ctx as CanvasRenderingContext2D & { letterSpacing?: string }

  const sections = song.sections
    .map((s) => ({
      label: s.title.toUpperCase(),
      lines: s.lines.map((l) => l.text.trim()).filter(Boolean),
    }))
    .filter((s) => s.lines.length)

  const layout = (fontSize: number, titleSize: number) => {
    const lineHeight = Math.round(fontSize * 1.52)
    ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`
    const space = ctx.measureText(' ').width
    const placedSections: { label: string; top: number; lines: PlacedWord[][] }[] = []
    let y = 0
    for (const section of sections) {
      y += Math.round(fontSize * 0.9)
      const top = y
      y += Math.round(fontSize * 1.9)
      const lines: PlacedWord[][] = []
      for (const text of section.lines) {
        const words = text.split(/\s+/).filter(Boolean)
        let x = 0
        let row: PlacedWord[] = []
        for (const raw of words) {
          const core = raw.replace(/^[^\w\d']+|[^\w\d']+$/g, '')
          const info = analyzeWord(core)
          const idx = familyColorIndex(info, 'rap', families)
          const color = idx === null ? palette.ink : rhymeColors[idx]
          const width = ctx.measureText(raw).width
          if (x > 0 && x + width > W - pad * 2) {
            lines.push(row)
            row = []
            x = 0
            y += lineHeight
          }
          row.push({ text: raw, color, x, width })
          x += width + space
        }
        lines.push(row)
        y += lineHeight
      }
      placedSections.push({ label: section.label, top, lines })
      y += Math.round(fontSize * 0.7)
    }
    return {
      sections: placedSections,
      total: y,
      lineHeight,
      titleSize,
    }
  }

  let fontSize = 36
  let titleSize = 68
  let result = layout(fontSize, titleSize)
  while (result.total > H - 380 && fontSize > 19) {
    fontSize -= 1.5
    titleSize = Math.max(44, titleSize - 1.2)
    result = layout(fontSize, titleSize)
  }

  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, W, H)

  // Paper texture: a couple of barely-there washes.
  const glow = ctx.createRadialGradient(W * 0.18, 0, 40, W * 0.18, 0, H * 0.8)
  glow.addColorStop(0, dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.7)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Wordmark
  ctx.save()
  ctx.translate(pad, 82)
  ctx.fillStyle = palette.accent
  ctx.beginPath()
  ctx.moveTo(0, 12)
  ctx.quadraticCurveTo(16, 0, 32, 10)
  ctx.quadraticCurveTo(46, 18, 58, 8)
  ctx.lineTo(58, 20)
  ctx.quadraticCurveTo(44, 30, 30, 22)
  ctx.quadraticCurveTo(16, 14, 0, 26)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = palette.ink
  ctx.font = '600 30px Lora, Georgia, serif'
  ctx.fillText('Flowstate', 74, 28)
  ctx.restore()

  lettered.letterSpacing = '3px'
  ctx.fillStyle = palette.muted
  ctx.font = '500 17px Inter, system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('LYRICS', W - pad, 100)
  ctx.textAlign = 'left'
  lettered.letterSpacing = '0px'

  // Title
  ctx.fillStyle = palette.ink
  ctx.font = `600 ${titleSize}px Lora, Georgia, serif`
  const title = song.title.trim() || 'Untitled song'
  const titleWords = title.split(/\s+/)
  const titleLines: string[] = []
  let current = ''
  for (const w of titleWords) {
    const next = current ? `${current} ${w}` : w
    if (ctx.measureText(next).width > W - pad * 2 && current) {
      titleLines.push(current)
      current = w
    } else current = next
  }
  titleLines.push(current)
  let titleY = 250
  for (const line of titleLines) {
    ctx.fillText(line, pad, titleY)
    titleY += titleSize * 1.12
  }

  lettered.letterSpacing = '2px'
  ctx.fillStyle = palette.muted
  ctx.font = '500 16px Inter, system-ui, sans-serif'
  const meta = [song.vibe, `${song.bpm} BPM`, song.folder].filter(Boolean).join(' · ').toUpperCase()
  ctx.fillText(meta, pad, titleY + 2)
  lettered.letterSpacing = '0px'

  titleY += 40
  ctx.strokeStyle = palette.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, titleY)
  ctx.lineTo(W - pad, titleY)
  ctx.stroke()

  const startY = titleY + 88
  const offset = Math.max(0, (startY + result.total > H - 130) ? H - 130 - (startY + result.total) : 0)

  for (const section of result.sections) {
    lettered.letterSpacing = '2.4px'
    ctx.fillStyle = palette.accent
    ctx.font = '600 15px Inter, system-ui, sans-serif'
    ctx.fillText(section.label, pad, startY + section.top + offset)
    lettered.letterSpacing = '0px'
    let y = startY + section.top + offset + Math.round(fontSize * 1.9)
    for (const row of section.lines) {
      for (const word of row) {
        ctx.fillStyle = word.color
        ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`
        ctx.fillText(word.text, pad + word.x, y)
      }
      y += result.lineHeight
    }
  }

  ctx.strokeStyle = palette.line
  ctx.beginPath()
  ctx.moveTo(pad, H - 92)
  ctx.lineTo(W - pad, H - 92)
  ctx.stroke()
  ctx.fillStyle = palette.muted
  ctx.font = '400 16px Inter, system-ui, sans-serif'
  ctx.fillText('written in flowstate — free & open source', pad, H - 60)
  ctx.textAlign = 'right'
  ctx.fillText(new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), W - pad, H - 60)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not render the image.'))), 'image/png')
  })
}

export async function downloadSongPng(song: Song, dark = false, square = false) {
  const blob = await renderSongPng(song, dark, square)
  downloadBlob(blob, `${safeName(song.title)}${square ? '-square' : ''}.png`)
}

export async function shareSongPng(song: Song, dark = false): Promise<'shared' | 'downloaded'> {
  const blob = await renderSongPng(song, dark, false)
  const file = new File([blob], `${safeName(song.title)}.png`, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  // A native sheet only makes sense on a touch device; desktop browsers expose
  // the API too, but some environments have no sheet behind it at all.
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (touch && nav.share) {
    try {
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: song.title, text: `${song.title} — lyrics` })
        return 'shared'
      }
    } catch {
      // Fall through and hand the image over as a normal download.
    }
  }
  downloadBlob(blob, file.name)
  return 'downloaded'
}

export function printSong(song: Song) {
  const html = printSongHtml(song)

  const bridge = window.flowstate
  if (bridge) {
    void bridge
      .printHtml({ html, title: song.title })
      .then((result) => {
        if (!result.ok) console.error(`[flowstate] print failed: ${result.reason ?? 'unknown'}`)
      })
      .catch((error) => console.error('[flowstate] print failed', error))
    return true
  }

  const printWindow = window.open('', '_blank', 'width=800,height=900')
  if (!printWindow) return false
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => printWindow.print(), 250)
  return true
}

/** The printable document, shared by the browser window and the desktop shell. */
export function printSongHtml(song: Song): string {
  const body = song.sections
    .map((section) => {
      const lines = section.lines.map((l) => l.text).filter((l) => l.trim())
      if (!lines.length) return ''
      return `<h2>${escapeHtml(section.title)}</h2><p>${lines.map((l) => escapeHtml(l)).join('<br/>')}</p>`
    })
    .join('')
  return `<!doctype html><html><head><title>${escapeHtml(song.title)}</title>
  <style>
    body{font-family:Georgia,serif;color:#222;max-width:620px;margin:60px auto;line-height:1.65;padding:0 24px}
    h1{font-size:34px;margin-bottom:4px} .meta{color:#777;font-family:system-ui;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
    h2{font-family:system-ui;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#1aa88f;margin-top:32px}
    p{font-size:17px;margin-top:8px} footer{margin-top:48px;color:#999;font-family:system-ui;font-size:11px}
  </style></head><body>
  <h1>${escapeHtml(song.title)}</h1>
  <div class="meta">${escapeHtml(song.vibe)} · ${song.bpm} BPM · ${escapeHtml(song.folder)}</div>
  ${body}
  <footer>written in Flowstate</footer>
  </body></html>`
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
