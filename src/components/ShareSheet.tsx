import { useEffect, useState } from 'react'
import { Check, Copy, Link2, UserMinus, X } from 'lucide-react'
import type { Song } from '../types'
import type { CloudControl } from '../lib/cloud/useCloudSync'
import { inviteUrl, type ShareRole, type SongMember } from '../lib/cloud/sharing'
import { IconButton, Segmented, Sheet } from './ui'

interface Props {
  open: boolean
  song: Song
  cloud: CloudControl
  onClose: () => void
  onNotify: (message: string) => void
}

const ROLE_LABEL: Record<SongMember['role'], string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

export default function ShareSheet({ open, song, cloud, onClose, onNotify }: Props) {
  const [role, setRole] = useState<ShareRole>('editor')
  const [link, setLink] = useState<string | null>(null)
  const [members, setMembers] = useState<SongMember[]>([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const signedIn = cloud.stage === 'signed-in' && !cloud.otherAccount

  useEffect(() => {
    if (!open) return
    setLink(null)
    setCopied(false)
    setNote(null)
    if (!signedIn) return
    let alive = true
    void cloud.sharing
      .members(song.id)
      .then((list) => {
        if (alive) setMembers(list)
      })
      .catch((err: unknown) => {
        if (alive) setNote(err instanceof Error ? err.message : 'Could not read who has access.')
      })
    return () => {
      alive = false
    }
  }, [open, signedIn, song.id, cloud.sharing])

  const createLink = async () => {
    if (busy) return
    setBusy(true)
    setNote(null)
    try {
      const token = await cloud.sharing.createInvite(song.id, role)
      const url = inviteUrl(token)
      setLink(url)
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
      } catch {
        // No clipboard permission: the field below is selectable instead.
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'The invite link could not be created.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      onNotify('Invite link copied')
    } catch {
      onNotify('Select the link and copy it by hand')
    }
  }

  const remove = async (member: SongMember) => {
    try {
      const done = await cloud.sharing.remove(song.id, member.userId)
      if (!done) {
        setNote('Only the song’s owner can remove a collaborator.')
        return
      }
      setMembers((list) => list.filter((item) => item.userId !== member.userId))
      onNotify('Removed from this song')
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not remove that collaborator.')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} className="dialog-sm" label="Share this song">
      <div className="dialog">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Collaborate</span>
            <h2>Share “{song.title || 'Untitled song'}”</h2>
          </div>
          <IconButton onClick={onClose} aria-label="Close">
            <X size={17} />
          </IconButton>
        </div>

        {!cloud.configured ? (
          <p className="auth-note">
            This build has no cloud project, so songs cannot be shared from it.
          </p>
        ) : !signedIn ? (
          <>
            <p className="auth-note">
              Sign in from the home screen first. A shared song lives in your account, and this one
              has not been uploaded yet.
            </p>
            <div className="dialog-actions">
              <button className="ghost-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <span className="field-label">New link lets someone</span>
              <Segmented
                value={role}
                onChange={setRole}
                options={[
                  { value: 'editor', label: 'Edit' },
                  { value: 'viewer', label: 'Read only' },
                ]}
                ariaLabel="Invite role"
              />
            </div>
            <button className="primary-btn" onClick={() => void createLink()} disabled={busy}>
              <Link2 size={15} /> {busy ? 'Creating…' : 'Create an invite link'}
            </button>

            {link && (
              <div className="share-link">
                <input
                  className="text-input"
                  readOnly
                  value={link}
                  aria-label="Invite link"
                  onFocus={(event) => event.target.select()}
                />
                <button className="ghost-btn sm" onClick={() => void copy()}>
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
            {link && (
              <p className="auth-note">
                The link works for fourteen days and needs the other person to sign in. Anyone with
                it can join, so send it somewhere private.
              </p>
            )}
            {note && <p className="auth-note is-error">{note}</p>}

            <div className="share-members">
              <span className="field-label">Who has access</span>
              {members.length === 0 ? (
                <p className="auth-note">Just you, so far.</p>
              ) : (
                members.map((member) => (
                  <div className="member-row" key={member.userId}>
                    <span className="member-email">
                      {member.email || 'Signed-in writer'}
                      {member.email === cloud.email ? ' (you)' : ''}
                    </span>
                    <span className={`member-role is-${member.role}`}>{ROLE_LABEL[member.role]}</span>
                    {member.role !== 'owner' && (
                      <button
                        className="icon-mini danger"
                        aria-label={`Remove ${member.email || 'collaborator'}`}
                        onClick={() => void remove(member)}
                      >
                        <UserMinus size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            <p className="auth-note">
              Lyrics sync between everyone on the song. Voice takes stay on the device that recorded
              them.
            </p>
          </>
        )}
      </div>
    </Sheet>
  )
}
