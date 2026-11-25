import { useEffect, useState } from 'react'
import { History, RotateCcw, Save, Trash2, X } from 'lucide-react'
import type { SongVersion } from '../lib/versions'
import { deleteVersion, describeVersion, listVersions } from '../lib/versions'
import { formatRelative } from '../lib/storage'
import { IconButton, Sheet } from './ui'

interface Props {
  open: boolean
  songId: string
  songTitle: string
  onClose: () => void
  onRestore: (version: SongVersion) => void
  onSaveNow: () => void
  onNotify: (message: string) => void
}

function preview(version: SongVersion): string {
  for (const section of version.sections) {
    for (const line of section.lines) {
      if (line.text.trim()) return line.text.trim()
    }
  }
  return 'Empty draft'
}

export default function HistorySheet({
  open, songId, songTitle, onClose, onRestore, onSaveNow, onNotify,
}: Props) {
  const [versions, setVersions] = useState<SongVersion[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (open) setVersions(listVersions(songId))
  }, [open, songId, tick])

  const remove = (id: string) => {
    deleteVersion(id)
    setTick((n) => n + 1)
    onNotify('Version removed')
  }

  return (
    <Sheet open={open} onClose={onClose} className="history-sheet" label="Version history">
      <div className="sheet-head">
        <div>
          <span className="eyebrow">Version history</span>
          <h2>{songTitle}</h2>
          <p className="word-hint">
            Snapshots are kept on this device while you write: every two minutes, whenever you
            leave the song, and whenever you ask.
          </p>
        </div>
        <IconButton onClick={onClose} aria-label="Close version history"><X size={18} /></IconButton>
      </div>

      <div className="history-body">
        <button className="ghost-btn" onClick={() => { onSaveNow(); setTick((n) => n + 1) }}>
          <Save size={15} /> Save this draft as a version
        </button>

        {versions.length === 0 ? (
          <div className="history-empty">
            <History size={22} />
            <p>
              No snapshots yet. Keep writing for a couple of minutes, or save one now — the
              current draft stays exactly as it is.
            </p>
          </div>
        ) : (
          <ol className="version-list">
            {versions.map((version) => (
              <li className="version-row" key={version.id}>
                <div className="version-main">
                  <div className="version-top">
                    <span>{formatRelative(version.at)}</span>
                    <em>{version.auto ? 'auto' : 'saved'}</em>
                    <span className="version-meta">{describeVersion(version)}</span>
                  </div>
                  <p>{preview(version)}</p>
                </div>
                <div className="version-actions">
                  <button
                    className="ghost-btn sm"
                    onClick={() => {
                      onRestore(version)
                      onClose()
                    }}
                  >
                    <RotateCcw size={13} /> Restore
                  </button>
                  <button className="icon-mini danger" onClick={() => remove(version.id)} aria-label="Delete version">
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="tool-note">
          Restoring swaps the lyrics on the page for the snapshot and saves the current draft as a
          version first. Audio takes stay where they are.
        </p>
      </div>
    </Sheet>
  )
}
