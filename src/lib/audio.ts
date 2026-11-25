import type { BeatStyle } from '../types'

/** A small offline drum machine so a beat is always one tap away. */
export class BeatEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private timer: number | null = null
  private nextTime = 0
  private step = 0
  private bpm = 90
  private style: BeatStyle = 'trap'
  private volume = 0.7
  private click = true
  playing = false

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
      const len = Math.floor(this.ctx.sampleRate * 0.5)
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.noise = buf
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  start(bpm: number, style: BeatStyle, volume: number, click: boolean) {
    const ctx = this.ensure()
    this.bpm = bpm
    this.style = style
    this.volume = volume
    this.click = click
    if (this.master) this.master.gain.value = volume
    if (this.playing) return
    this.playing = true
    this.step = 0
    this.nextTime = ctx.currentTime + 0.06
    this.timer = window.setInterval(() => this.scheduler(), 25)
  }

  update(opts: { bpm?: number; style?: BeatStyle; volume?: number; click?: boolean }) {
    if (opts.bpm !== undefined) this.bpm = opts.bpm
    if (opts.style !== undefined) this.style = opts.style
    if (opts.volume !== undefined) {
      this.volume = opts.volume
      if (this.master) this.master.gain.value = opts.volume
    }
    if (opts.click !== undefined) this.click = opts.click
  }

  stop() {
    this.playing = false
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  dispose() {
    this.stop()
    if (this.ctx) void this.ctx.close()
    this.ctx = null
    this.master = null
  }

  private scheduler() {
    if (!this.ctx) return
    const ahead = 0.12
    while (this.nextTime < this.ctx.currentTime + ahead) {
      this.scheduleStep(this.step, this.nextTime)
      this.nextTime += 60 / this.bpm / 4
      this.step = (this.step + 1) % 16
    }
  }

  private scheduleStep(step: number, time: number) {
    const { kicks, snares, hats, bass } = this.patterns()
    if (kicks.includes(step)) this.kick(time)
    if (snares.includes(step)) this.snare(time)
    if (hats.includes(step)) this.hat(time, step % 8 === 6)
    if (bass.includes(step)) this.sub(time, step === 0)
    if (this.click && step % 4 === 0) this.tick(time, step === 0)
  }

  private patterns() {
    switch (this.style) {
      case 'drill':
        return {
          kicks: [0, 3, 7, 10, 14],
          snares: [4, 12],
          hats: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15],
          bass: [0, 3, 7, 10, 14],
        }
      case 'boom':
        return {
          kicks: [0, 6, 10],
          snares: [4, 12],
          hats: [0, 2, 4, 6, 8, 10, 12, 14],
          bass: [0, 6],
        }
      case 'lofi':
        return {
          kicks: [0, 10],
          snares: [4, 12],
          hats: [2, 6, 10, 14],
          bass: [0],
        }
      case 'trap':
      default:
        return {
          kicks: [0, 6, 10],
          snares: [4, 12],
          hats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
          bass: [0, 6, 10],
        }
    }
  }

  private kick(time: number) {
    const ctx = this.ensure()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(155, time)
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.14)
    gain.gain.setValueAtTime(0.9, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3)
    osc.connect(gain).connect(this.master!)
    osc.start(time)
    osc.stop(time + 0.32)
  }

  private snare(time: number) {
    const ctx = this.ensure()
    if (!this.noise) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 1400
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.42, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.17)
    src.connect(filter).connect(gain).connect(this.master!)
    src.start(time)
    src.stop(time + 0.2)
    const tone = ctx.createOscillator()
    const tg = ctx.createGain()
    tone.type = 'triangle'
    tone.frequency.value = 190
    tg.gain.setValueAtTime(0.2, time)
    tg.gain.exponentialRampToValueAtTime(0.001, time + 0.1)
    tone.connect(tg).connect(this.master!)
    tone.start(time)
    tone.stop(time + 0.12)
  }

  private hat(time: number, open: boolean) {
    const ctx = this.ensure()
    if (!this.noise) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 7500
    const gain = ctx.createGain()
    const level = this.style === 'lofi' ? 0.075 : 0.11
    gain.gain.setValueAtTime(level * (open ? 0.8 : 1), time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.14 : 0.045))
    src.connect(filter).connect(gain).connect(this.master!)
    src.start(time)
    src.stop(time + 0.16)
  }

  private sub(time: number, accent: boolean) {
    if (this.style === 'lofi' && !accent) return
    const ctx = this.ensure()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    const root = this.style === 'drill' ? 41.2 : 55
    osc.frequency.setValueAtTime(root, time)
    osc.frequency.exponentialRampToValueAtTime(root * 0.94, time + 0.25)
    gain.gain.setValueAtTime(0.34, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4)
    osc.connect(gain).connect(this.master!)
    osc.start(time)
    osc.stop(time + 0.42)
  }

  private tick(time: number, accent: boolean) {
    const ctx = this.ensure()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = accent ? 1600 : 1050
    gain.gain.setValueAtTime(accent ? 0.045 : 0.028, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03)
    osc.connect(gain).connect(this.master!)
    osc.start(time)
    osc.stop(time + 0.035)
  }
}

export interface RecorderHandle {
  stop: () => Promise<{ blob: Blob; duration: number }>
  cancel: () => void
  startedAt: number
}

export async function createRecorder(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  const mimeType = candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m))
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.start()
  const startedAt = performance.now()
  const cleanup = () => stream.getTracks().forEach((t) => t.stop())
  return {
    startedAt,
    cancel: () => {
      try {
        recorder.stop()
      } catch {
        /* already stopped */
      }
      cleanup()
    },
    stop: () =>
      new Promise((resolve) => {
        const finish = () => {
          cleanup()
          resolve({
            blob: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }),
            duration: performance.now() - startedAt,
          })
        }
        if (recorder.state === 'inactive') finish()
        else {
          recorder.onstop = finish
          recorder.stop()
        }
      }),
  }
}

/** A silent permission prompt, so a count-in never gets eaten by the mic dialog. */
export async function primeMicrophone(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

/**
 * Four-beat count-in with an audible tick. Returns a cancel function; the
 * audio context closes itself when the count finishes.
 */
export function countIn(beats: number, onBeat: (beat: number) => void): () => void {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  const beatMs = 600
  const timers: number[] = []
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    timers.forEach((id) => window.clearTimeout(id))
    void ctx.close().catch(() => undefined)
  }
  for (let i = 0; i < beats; i++) {
    timers.push(
      window.setTimeout(() => {
        onBeat(beats - i)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = i === 0 ? 1320 : 880
        const t = ctx.currentTime + 0.01
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.12)
      }, i * beatMs),
    )
  }
  timers.push(window.setTimeout(close, beats * beatMs + 250))
  return close
}

export function tapBpm(taps: number[]): number | null {
  if (taps.length < 2) return null
  const recent = taps.slice(-5)
  const gaps = recent.slice(1).map((t, i) => t - recent[i]).filter((g) => g > 120 && g < 2000)
  if (!gaps.length) return null
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  return Math.max(40, Math.min(220, Math.round(60000 / avg)))
}
