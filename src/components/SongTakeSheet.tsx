import { useEffect, useRef, useState } from 'react'
import { Headphones, Mic, Play, Square, Timer, Trash2, X } from 'lucide-react'
import type { Settings, Song, Take } from '../types'
import { uid } from '../types'
import {
  BeatEngine,
  countIn,
  createRecorder,
  primeMicrophone,
  type RecorderHandle,
} from '../lib/audio'
import { deleteTakeBlob, deviceId, getTakeBlob, putTakeBlob } from '../lib/storage'
import { IconButton, Sheet, Switch } from './ui'

interface Props {
  open: boolean
  song: Song
  settings: Settings
  onClose: () => void
  onUpdateSong: (song: Song) => void
  onNotify: (message: string) => void
}

export default function SongTakeSheet({ open, song, settings, onClose, onUpdateSong, onNotify }: Props) {
  const [recording, setRecording] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [useCountIn, setUseCountIn] = useState(true)
  const [withBeat, setWithBeat] = useState(true)
  const recorderRef = useRef<RecorderHandle | null>(null)
  const beatRef = useRef<BeatEngine | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startTimer = useRef<number | null>(null)
  const cancelCount = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!recording) return
    const started = recorderRef.current?.startedAt ?? performance.now()
    const timer = window.setInterval(() => setElapsed(performance.now() - started), 150)
    return () => window.clearInterval(timer)
  }, [recording])

  useEffect(() => {
    if (!open) {
      recorderRef.current?.cancel()
      recorderRef.current = null
      beatRef.current?.dispose()
      beatRef.current = null
      audioRef.current?.pause()
      audioRef.current = null
      if (startTimer.current) window.clearTimeout(startTimer.current)
      cancelCount.current?.()
      cancelCount.current = null
      setRecording(false)
      setCountdown(null)
      setPlayingId(null)
    }
  }, [open])

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
      beatRef.current?.dispose()
      audioRef.current?.pause()
      if (startTimer.current) window.clearTimeout(startTimer.current)
      cancelCount.current?.()
    }
  }, [])

  const startRecording = async () => {
    if (recording || countdown !== null) return
    const ready = await primeMicrophone()
    if (!ready) {
      onNotify('Microphone access is needed to record the song')
      return
    }
    if (!useCountIn) {
      void beginRecording()
      return
    }
    setCountdown(4)
    cancelCount.current = countIn(4, (beat) => setCountdown(beat))
    startTimer.current = window.setTimeout(() => {
      startTimer.current = null
      cancelCount.current = null
      void beginRecording()
    }, 4 * 600)
  }

  const beginRecording = async () => {
    setCountdown(null)
    try {
      recorderRef.current = await createRecorder()
    } catch {
      onNotify('Could not open the microphone')
      return
    }
    setElapsed(0)
    setRecording(true)
    if (withBeat) {
      beatRef.current = new BeatEngine()
      beatRef.current.start(settings.bpm, settings.beatStyle, settings.volume * 0.6, true)
    }
  }

  const stopRecording = async () => {
    const recorder = recorderRef.current
    if (!recorder) return
    setRecording(false)
    beatRef.current?.dispose()
    beatRef.current = null
    const { blob, duration } = await recorder.stop()
    recorderRef.current = null
    if (blob.size < 2000) {
      onNotify('That take was too short to keep')
      return
    }
    const id = uid()
    try {
      await putTakeBlob(id, blob)
      const number = song.takes.length + 1
      onUpdateSong({
        ...song,
        takes: [
          ...song.takes,
          {
            id,
            name: `Full take ${String(number).padStart(2, '0')}`,
            duration,
            createdAt: Date.now(),
            device: deviceId(),
          },
        ],
      })
      onNotify('Full take saved on this device')
    } catch {
      onNotify('Could not save that take')
    }
  }

  const cancelEverything = () => {
    if (startTimer.current) window.clearTimeout(startTimer.current)
    startTimer.current = null
    cancelCount.current?.()
    cancelCount.current = null
    setCountdown(null)
    recorderRef.current?.cancel()
    recorderRef.current = null
    beatRef.current?.dispose()
    beatRef.current = null
    setRecording(false)
    setElapsed(0)
  }

  const stopPlayback = () => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
  }

  const playTake = async (take: Take) => {
    if (playingId === take.id) {
      stopPlayback()
      return
    }
    stopPlayback()
    const blob = await getTakeBlob(take.id).catch(() => null)
    if (!blob) {
      onNotify(
        take.device && take.device !== deviceId()
          ? 'That take was recorded on another device, so its audio is not here'
          : 'That audio is missing from this device',
      )
      return
    }
    const audio = new Audio(URL.createObjectURL(blob))
    audioRef.current = audio
    setPlayingId(take.id)
    audio.onended = () => setPlayingId(null)
    audio.play().catch(() => onNotify('Could not play that take'))
  }

  const removeTake = async (take: Take) => {
    if (playingId === take.id) stopPlayback()
    await deleteTakeBlob(take.id).catch(() => undefined)
    onUpdateSong({ ...song, takes: song.takes.filter((t) => t.id !== take.id) })
  }

  return (
    <Sheet open={open} onClose={onClose} className="take-sheet" label="Record the song">
      <div className="sheet-head">
        <div>
          <span className="eyebrow">Booth recorder</span>
          <h2>Full song take</h2>
          <p className="word-hint">One pass of the whole song, saved on this device next to the lyrics.</p>
        </div>
        <IconButton onClick={onClose} aria-label="Close recorder"><X size={18} /></IconButton>
      </div>

      <div className="history-body">
        <div className="record-options">
          <label className="record-toggle">
            <div>
              <span>Four-beat count-in</span>
              <p>Gives you a bar of clicks before the take starts.</p>
            </div>
            <Switch checked={useCountIn} onChange={setUseCountIn} label="Count-in" />
          </label>
          <label className="record-toggle">
            <div>
              <span>Play the beat</span>
              <p>Through your speakers. Wear headphones so the mic stays clean.</p>
            </div>
            <Switch checked={withBeat} onChange={setWithBeat} label="Play the beat while recording" />
          </label>
        </div>

        <div className="record-console">
          {countdown !== null ? (
            <>
              <div className="countdown" aria-live="polite">{countdown}</div>
              <button className="ghost-btn" onClick={cancelEverything}>Cancel</button>
            </>
          ) : recording ? (
            <>
              <div className="record-time" aria-live="polite">
                <Timer size={16} /> {Math.floor(elapsed / 1000)}s
              </div>
              <button className="primary-btn record-stop" onClick={() => void stopRecording()}>
                <Square size={15} /> Stop and keep it
              </button>
            </>
          ) : (
            <button className="primary-btn record-start" onClick={() => void startRecording()}>
              <Mic size={16} /> Record the song
            </button>
          )}
        </div>

        <p className="record-hint">
          <Headphones size={13} /> Takes are audio only and stay in this browser. They are not part
          of the JSON backup, which keeps the file small.
        </p>

        {song.takes.length === 0 ? (
          <p className="word-empty">No full takes yet. A rough pass is still a useful map of the song.</p>
        ) : (
          <div className="song-take-list">
            {song.takes.map((take) => (
              <div className="take-row" key={take.id}>
                <button className="take-play" onClick={() => void playTake(take)} aria-label="Play take">
                  {playingId === take.id ? <Square size={11} /> : <Play size={12} />}
                </button>
                <input
                  className="take-name"
                  value={take.name}
                  onChange={(event) =>
                    onUpdateSong({
                      ...song,
                      takes: song.takes.map((item) =>
                        item.id === take.id ? { ...item, name: event.target.value } : item,
                      ),
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
                <button className="icon-mini danger" onClick={() => void removeTake(take)} aria-label="Delete take">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}
