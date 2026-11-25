import { useEffect, useState } from 'react'
import { LogOut, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react'
import type { CloudControl } from '../lib/cloud/useCloudSync'
import { formatRelative } from '../lib/storage'
import { IconButton, Sheet } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  cloud: CloudControl
  onExportBackup: () => void
}

type Mode = 'in' | 'up' | 'reset'

export default function CloudSheet({ open, onClose, cloud, onExportBackup }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'error' | 'good' } | null>(null)
  const [mode, setMode] = useState<Mode>('in')
  const [armedClean, setArmedClean] = useState(false)
  const [armedErase, setArmedErase] = useState(false)
  /** A sign-in is in flight; close only once the session lands on this device's account. */
  const [awaiting, setAwaiting] = useState(false)

  useEffect(() => {
    if (open) return
    setPassword('')
    setNote(null)
    setMode('in')
    setArmedClean(false)
    setArmedErase(false)
    setAwaiting(false)
  }, [open])

  useEffect(() => {
    if (!open || !awaiting) return
    if (cloud.stage === 'signed-in' && !cloud.otherAccount) {
      setAwaiting(false)
      onClose()
    }
  }, [open, awaiting, cloud.stage, cloud.otherAccount, onClose])

  const statusText =
    cloud.status === 'syncing'
      ? 'Syncing your changes…'
      : cloud.status === 'error'
        ? 'The last sync did not finish.'
        : cloud.status === 'offline'
          ? 'Offline — this will catch up when you reconnect.'
          : cloud.lastSyncedAt
            ? `Synced ${formatRelative(cloud.lastSyncedAt)}`
            : 'Ready when you are.'

  const submit = async (kind: Mode) => {
    if (busy) return
    if (!email.trim()) {
      setNote({ text: 'Enter your email address.', tone: 'error' })
      return
    }
    if (kind !== 'reset' && !password) {
      setNote({ text: 'Enter your email and a password.', tone: 'error' })
      return
    }
    setNote(null)
    setBusy(true)
    try {
      if (kind === 'in') {
        setAwaiting(true)
        const problem = await cloud.signIn(email, password)
        if (problem) {
          setAwaiting(false)
          setNote({ text: problem, tone: 'error' })
        } else {
          // The effect above closes the sheet, except when this device's library
          // belongs to another account: then the warning needs to be seen first.
          setPassword('')
        }
        return
      }
      if (kind === 'up') {
        const result = await cloud.signUp(email, password)
        if (result.error) setNote({ text: result.error, tone: 'error' })
        else if (result.notice) {
          setPassword('')
          setNote({ text: result.notice, tone: 'good' })
        } else {
          setPassword('')
          onClose()
        }
        return
      }
      const problem = await cloud.requestPasswordReset(email)
      setNote(
        problem
          ? { text: problem, tone: 'error' }
          : { text: 'Check your inbox for a link to set a new password.', tone: 'good' },
      )
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async () => {
    if (busy) return
    if (password.length < 6) {
      setNote({ text: 'Use at least six characters.', tone: 'error' })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const problem = await cloud.updatePassword(password)
      if (problem) setNote({ text: problem, tone: 'error' })
      else {
        setPassword('')
        setNote({ text: 'Password saved. You are signed in on this device.', tone: 'good' })
      }
    } finally {
      setBusy(false)
    }
  }

  const erase = async () => {
    if (!armedErase) {
      setArmedErase(true)
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const problem = await cloud.eraseCloudCopy()
      setArmedErase(false)
      if (problem) setNote({ text: problem, tone: 'error' })
      else setNote({ text: 'Cloud copy erased. Your songs are still on this device.', tone: 'good' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} className="dialog-sm" label="Cloud sync">
      <div className="dialog">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Cloud sync</span>
            <h2>{cloud.stage === 'signed-in' ? 'Signed in' : 'Sign in to sync'}</h2>
          </div>
          <IconButton onClick={onClose} aria-label="Close">
            <X size={17} />
          </IconButton>
        </div>

        {!cloud.configured ? (
          <p className="auth-note">
            This build has no cloud project configured, so songs stay on this device.
          </p>
        ) : cloud.recovery ? (
          <>
            <p className="auth-note">
              Choose a new password for {cloud.email ?? 'your account'}, then carry on where you left off.
            </p>
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault()
                void savePassword()
              }}
            >
              <label className="field">
                <span className="field-label">New password</span>
                <input
                  className="text-input"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  placeholder="At least six characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {note && <p className={`auth-note is-${note.tone}`}>{note.text}</p>}
              <button className="primary-btn" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save new password'}
              </button>
              <button className="ghost-btn" type="button" onClick={cloud.finishRecovery}>
                Not now
              </button>
            </form>
          </>
        ) : cloud.stage === 'signed-in' && cloud.otherAccount ? (
          <>
            <div className="cloud-account">
              <span className="cloud-account-label">Signed in as</span>
              <strong>{cloud.email ?? 'your account'}</strong>
            </div>
            <p className="auth-note is-error">
              <ShieldAlert size={14} /> This device’s songs were last synced to a different account.
              Nothing has been uploaded.
            </p>
            <div className="dialog-actions">
              <button
                className="primary-btn"
                onClick={() => {
                  cloud.resolveAccount('keep')
                  setArmedClean(false)
                  onClose()
                }}
              >
                Keep this device’s songs
              </button>
            </div>
            <div className="dialog-actions">
              <button
                className={`ghost-btn ${armedClean ? 'danger is-armed' : ''}`}
                onClick={() => {
                  if (!armedClean) {
                    setArmedClean(true)
                    return
                  }
                  cloud.resolveAccount('clean')
                  setArmedClean(false)
                  onClose()
                }}
              >
                {armedClean ? 'Tap again to clear this device' : 'Use this account’s library'}
              </button>
              <button className="ghost-btn" onClick={onExportBackup}>
                Export a backup first
              </button>
            </div>
            <p className="auth-note">
              Keeping the songs uploads them into this account. Using the account’s library clears the
              songs on this device first, so export a backup if you might want them.
            </p>
          </>
        ) : cloud.stage === 'signed-in' ? (
          <>
            <div className="cloud-account">
              <span className="cloud-account-label">Signed in as</span>
              <strong>{cloud.email ?? 'your account'}</strong>
            </div>
            <p className="auth-note">{statusText}</p>
            {cloud.error && <p className="auth-note is-error">{cloud.error}</p>}
            {note && <p className={`auth-note is-${note.tone}`}>{note.text}</p>}
            <div className="dialog-actions">
              <button
                className="ghost-btn"
                onClick={() => void cloud.syncNow()}
                disabled={cloud.status === 'syncing'}
              >
                <RefreshCw size={14} /> Sync now
              </button>
              <button className="ghost-btn" onClick={() => void cloud.signOut()}>
                <LogOut size={14} /> Sign out
              </button>
            </div>
            <button
              className={`ghost-btn danger ${armedErase ? 'is-armed' : ''}`}
              onClick={() => void erase()}
              disabled={busy}
            >
              <Trash2 size={14} /> {armedErase ? 'Tap again to erase the cloud copy' : 'Erase my cloud copy'}
            </button>
            <p className="auth-note">
              Songs stay on this device either way. Signing in copies them to your account so your
              other devices can open them. Erasing removes what is in the account, not this browser.
            </p>
          </>
        ) : (
          <>
            {mode === 'reset' ? (
              <form
                className="auth-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit('reset')
                }}
              >
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    className="text-input"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                {note && <p className={`auth-note is-${note.tone}`}>{note.text}</p>}
                <button className="primary-btn" type="submit" disabled={busy}>
                  {busy ? 'Working…' : 'Email me a reset link'}
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => {
                    setMode('in')
                    setNote(null)
                  }}
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <form
                className="auth-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit('in')
                }}
              >
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    className="text-input"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Password</span>
                  <input
                    className="text-input"
                    type="password"
                    autoComplete="current-password"
                    placeholder="At least six characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                {(note || cloud.error) && (
                  <p className={`auth-note is-${note?.tone ?? 'error'}`}>{note?.text ?? cloud.error}</p>
                )}
                <button className="primary-btn" type="submit" disabled={busy || cloud.stage === 'loading'}>
                  {busy ? 'Working…' : 'Sign in'}
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  disabled={busy}
                  onClick={() => void submit('up')}
                >
                  Create an account
                </button>
                <button
                  className="link-btn"
                  type="button"
                  onClick={() => {
                    setMode('reset')
                    setNote(null)
                  }}
                >
                  Forgot your password?
                </button>
              </form>
            )}
            <p className="auth-note">
              Flowstate still saves to this device first. Signing in only adds a copy in your
              account — no account is needed to write.
            </p>
          </>
        )}
      </div>
    </Sheet>
  )
}
