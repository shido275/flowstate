import { useEffect, useRef, useState } from 'react'
import { Download, Trash2, Upload, X } from 'lucide-react'
import type { Settings } from '../types'
import { BEAT_OPTIONS } from '../types'
import { PHONE_RE } from '../lib/engine'
import { storageInfo, type StorageInfo } from '../lib/storage'
import { COWRITER_NOTE } from '../lib/wordbank'
import { IconButton, Segmented, Sheet, Switch } from './ui'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  lexicon: Record<string, string>
  onUpdate: (patch: Partial<Settings>) => void
  onUpdateLexicon: (lexicon: Record<string, string>) => void
  onImportBackup: (text: string) => void
  onExportBackup: () => void
  onNotify: (msg: string) => void
  onDeleteAll: () => void
  hasSongs: boolean
}

export default function SettingsSheet({
  open, onClose, settings, lexicon, onUpdate, onUpdateLexicon, onImportBackup, onExportBackup,
  onNotify, onDeleteAll, hasSongs,
}: Props) {
  const importRef = useRef<HTMLInputElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [word, setWord] = useState('')
  const [phones, setPhones] = useState('')
  const [lexError, setLexError] = useState('')
  const [storage, setStorage] = useState<StorageInfo | null>(null)

  useEffect(() => {
    if (!open) setConfirmDelete(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    let alive = true
    void storageInfo().then((info) => {
      if (alive) setStorage(info)
    })
    return () => {
      alive = false
    }
  }, [open, hasSongs])

  const addPronunciation = () => {
    const clean = word.trim().toLowerCase()
    const value = phones.trim().toUpperCase().replace(/\s+/g, ' ')
    if (!/^[a-z][a-z'’-]*$/.test(clean)) {
      setLexError('Use letters, apostrophes or hyphens for the word.')
      return
    }
    if (!PHONE_RE.test(value)) {
      setLexError('Phones look like “JH AO1 N” — ARPABET with an optional 0/1/2 stress.')
      return
    }
    onUpdateLexicon({ ...lexicon, [clean]: value })
    setWord('')
    setPhones('')
    setLexError('')
  }

  const removePronunciation = (key: string) => {
    const next = { ...lexicon }
    delete next[key]
    onUpdateLexicon(next)
  }

  const localRatio = storage?.quota ? (storage.usage ?? 0) / storage.quota : 0
  const tight = (storage?.localBytes ?? 0) > 4_200_000

  return (
    <Sheet open={open} onClose={onClose} className="settings-sheet" label="Settings">
      <div className="sheet-head">
        <div>
          <span className="eyebrow">Preferences</span>
          <h2>Settings</h2>
        </div>
        <IconButton onClick={onClose} aria-label="Close settings"><X size={18} /></IconButton>
      </div>

      <div className="settings-scroll">
        <section className="settings-group">
          <h3>Appearance</h3>
          <div className="setting-row">
            <div>
              <span>Theme</span>
              <p>Warm paper by day, charcoal at night.</p>
            </div>
            <Segmented
              value={settings.theme}
              onChange={(theme) => onUpdate({ theme })}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'Device' },
              ]}
              ariaLabel="Theme"
            />
          </div>
          <div className="setting-row column">
            <div className="row-between">
              <div>
                <span>Lyric size</span>
                <p>Bigger type for reading at arm's length.</p>
              </div>
              <em>{Math.round(settings.fontScale * 100)}%</em>
            </div>
            <input
              type="range"
              min={0.85}
              max={1.35}
              step={0.05}
              value={settings.fontScale}
              onChange={(e) => onUpdate({ fontScale: Number(e.target.value) })}
            />
          </div>
        </section>

        <section className="settings-group">
          <h3>Writing &amp; analysis</h3>
          <div className="setting-row">
            <div>
              <span>Rhyme colouring</span>
              <p>Strict hears exact rhymes; Rap hears assonance; Loose blends accents.</p>
            </div>
            <Segmented
              value={settings.rhymeMode}
              onChange={(rhymeMode) => onUpdate({ rhymeMode })}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'strict', label: 'Strict' },
                { value: 'rap', label: 'Rap' },
                { value: 'loose', label: 'Loose' },
              ]}
              ariaLabel="Rhyme colour mode"
            />
          </div>
          <div className="setting-row">
            <div><span>Syllable glyphs</span><p>The dot / triangle / hex pattern beside each bar.</p></div>
            <Switch checked={settings.showSyllables} onChange={(v) => onUpdate({ showSyllables: v })} label="Syllable glyphs" />
          </div>
          <div className="setting-row">
            <div><span>Rhyme scheme letters</span><p>A, B, C labels for each line ending.</p></div>
            <Switch checked={settings.showRhymeLetters} onChange={(v) => onUpdate({ showRhymeLetters: v })} label="Rhyme letters" />
          </div>
          <div className="setting-row">
            <div><span>Beat grid</span><p>A strip showing each bar against the section average.</p></div>
            <Switch checked={settings.showBeatGrid} onChange={(v) => onUpdate({ showBeatGrid: v })} label="Beat grid" />
          </div>
          <div className="setting-row">
            <div><span>Ghost rhymes</span><p>Faint suggestions on an empty line, built from the bar above.</p></div>
            <Switch checked={settings.ghostRhymes} onChange={(v) => onUpdate({ ghostRhymes: v })} label="Ghost rhymes" />
          </div>
        </section>

        <section className="settings-group">
          <h3>Your pronunciations</h3>
          <p className="group-copy">
            Names, slang and invented words the dictionary does not know. Teach it once and it
            rhymes, counts and stresses them like any other word.
          </p>
          <div className="lexicon-form">
            <input
              value={word}
              onChange={(event) => { setWord(event.target.value); setLexError('') }}
              placeholder="word"
              aria-label="Word to teach"
              spellCheck={false}
            />
            <input
              className="lex-phones"
              value={phones}
              onChange={(event) => { setPhones(event.target.value); setLexError('') }}
              placeholder="phones, e.g. JH AO1 N"
              aria-label="Phones"
              spellCheck={false}
            />
            <button className="ghost-btn sm" onClick={addPronunciation} disabled={!word.trim() || !phones.trim()}>
              Teach it
            </button>
          </div>
          {lexError && <p className="lexicon-error">{lexError}</p>}
          {Object.keys(lexicon).length ? (
            <div className="lexicon-list">
              {Object.entries(lexicon).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                <span className="lexicon-chip" key={key}>
                  {key} <code>{value}</code>
                  <button onClick={() => removePronunciation(key)} aria-label={`Forget ${key}`}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="tool-note">Nothing taught yet. Try a producer's name, a place, or a word you made up.</p>
          )}
        </section>

        <section className="settings-group">
          <h3>Beat</h3>
          <div className="setting-row">
            <div><span>Pattern</span><p>Drums are synthesised locally, so there is nothing to download.</p></div>
            <select
              className="select"
              value={settings.beatStyle}
              onChange={(e) => onUpdate({ beatStyle: e.target.value as Settings['beatStyle'] })}
              aria-label="Beat style"
            >
              {BEAT_OPTIONS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </div>
          <div className="setting-row column">
            <div className="row-between">
              <div><span>Tempo</span><p>Also adjustable from the editor dock.</p></div>
              <em>{settings.bpm} BPM</em>
            </div>
            <input
              type="range"
              min={50}
              max={180}
              value={settings.bpm}
              onChange={(e) => onUpdate({ bpm: Number(e.target.value) })}
            />
          </div>
          <div className="setting-row column">
            <div className="row-between">
              <div><span>Volume</span><p>Click track included.</p></div>
              <em>{Math.round(settings.volume * 100)}%</em>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => onUpdate({ volume: Number(e.target.value) })}
            />
          </div>
          <div className="setting-row">
            <div><span>Click track</span><p>A soft pulse on every beat.</p></div>
            <Switch checked={settings.click} onChange={(v) => onUpdate({ click: v })} label="Click track" />
          </div>
        </section>

        <section className="settings-group">
          <h3>Your data</h3>
          <p className="group-copy">
            Songs save to this browser after every keystroke. Takes and version history live in
            this browser too. A backup file is the only way to move your library, so keep one.
          </p>
          {storage && (
            <div className={`quota ${tight ? 'is-tight' : ''}`}>
              <div className="quota-top">
                <span>Drafts and history</span>
                <em>{formatBytes(storage.localBytes)} stored</em>
              </div>
              {storage.quota ? (
                <>
                  <div className="quota-bar">
                    <span style={{ width: `${Math.min(100, localRatio * 100)}%` }} />
                  </div>
                  <p>
                    {formatBytes(storage.usage ?? 0)} of the {formatBytes(storage.quota)} this browser
                    offers this site ({Math.round(localRatio * 100)}%).
                  </p>
                </>
              ) : (
                <p>The browser does not report a quota; local drafts stay under the usual 5 MB.</p>
              )}
            </div>
          )}
          {tight && (
            <p className="warn-line">
              Drafts are close to the usual 5 MB localStorage limit. Export a backup, then clear a
              few finished songs.
            </p>
          )}
          <div className="button-row">
            <button className="ghost-btn" onClick={onExportBackup}><Download size={15} /> Export backup</button>
            <button className="ghost-btn" onClick={() => importRef.current?.click()}><Upload size={15} /> Import backup</button>
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
                  onNotify(err instanceof Error ? err.message : 'Could not read that file')
                }
                e.target.value = ''
              }}
            />
          </div>
          {hasSongs && (
            <div className="danger-row">
              <button
                className={`ghost-btn danger ${confirmDelete ? 'is-armed' : ''}`}
                onClick={() => {
                  if (!confirmDelete) { setConfirmDelete(true); return }
                  onDeleteAll()
                  setConfirmDelete(false)
                  onClose()
                }}
              >
                <Trash2 size={15} /> {confirmDelete ? 'Tap again to delete every song' : 'Delete all songs'}
              </button>
              {confirmDelete && <button className="link-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>}
            </div>
          )}
        </section>

        <section className="settings-group about">
          <h3>About Flowstate</h3>
          <p>
            A free, open-source, local-first songwriting studio. No ads, no tracking, and no
            server quietly holding your drafts — sync only happens if you sign in, and takes
            never leave the device that recorded them. Built in the spirit of Flowrite, with the
            tools writers expect from RapPad, RhymeFlux and Lyric Studio.
          </p>
          <p className="fine">{COWRITER_NOTE}</p>
          <p className="fine">
            Pronunciation data: CMU Pronouncing Dictionary (BSD). Common-word ranking:
            google-10000-english. Fonts: Lora &amp; Inter (SIL Open Font License).
            Code licensed MIT.
          </p>
          <p className="fine">
            Shortcuts: <kbd>⌘/Ctrl</kbd> + <kbd>S</kbd> export text, <kbd>⌘/Ctrl</kbd> + <kbd>Z</kbd> undo,
            <kbd>⇧</kbd> + <kbd>⌘/Ctrl</kbd> + <kbd>Z</kbd> redo, <kbd>Enter</kbd> new bar, <kbd>↑</kbd>/<kbd>↓</kbd>{' '}
            move between bars, double-click a word for rhymes.
          </p>
          <p className="fine">
            Built as an installable web app: use Add to Home Screen (iOS) or Install (desktop
            Chrome) once the page has loaded to keep Flowstate available offline.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
