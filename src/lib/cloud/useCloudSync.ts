import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState } from '../../types'
import { loadOwnerId, saveOwnerId } from '../storage'
import { cloudConfigured, loadSupabase, shouldResumeSession } from './client'
import {
  POLL_MS,
  PUSH_DEBOUNCE_MS,
  createSyncEngine,
  type SyncEngine,
  type SyncStatus,
} from './engine'
import {
  acceptInvite as acceptInviteRow,
  createInvite as createInviteRow,
  listMembers,
  removeMember as removeMemberRow,
  type ShareRole,
  type SongMember,
} from './sharing'

export type AuthStage = 'loading' | 'signed-out' | 'signed-in'
export type CloudStatus = 'signed-out' | SyncStatus

export interface CloudSharing {
  createInvite: (songId: string, role: ShareRole) => Promise<string>
  accept: (token: string) => Promise<{ songId: string; title: string } | null>
  members: (songId: string) => Promise<SongMember[]>
  remove: (songId: string, userId: string) => Promise<boolean>
}

export interface CloudControl {
  configured: boolean
  stage: AuthStage
  email: string | null
  status: CloudStatus
  lastSyncedAt: number | null
  error: string | null
  /** This device's library was last synced to a different account. */
  otherAccount: boolean
  /** The link in an email opened this tab; ask for a new password first. */
  recovery: boolean
  /** Resolves to a message to show, or null when it worked. */
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<{ error: string | null; notice: string | null }>
  signOut: () => Promise<void>
  syncNow: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
  finishRecovery: () => void
  resolveAccount: (choice: 'keep' | 'clean') => void
  eraseCloudCopy: () => Promise<string | null>
  sharing: CloudSharing
}

function messageOf(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error) return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

function authMessage(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'That email and password don’t match an account.'
  if (lower.includes('email not confirmed')) return 'Confirm your email first — the link is in your inbox.'
  if (lower.includes('already registered') || lower.includes('already been registered'))
    return 'That email already has an account — sign in instead.'
  if (lower.includes('password should be at least')) return 'Use at least six characters for the password.'
  if (lower.includes('rate limit') || lower.includes('too many'))
    return 'Too many tries just now — give it a minute.'
  if (lower.includes('database error saving new user'))
    return 'The server could not create that account. Try again in a moment.'
  return message
}

/** Where Supabase should send the confirmation and recovery links back to. */
function returnTo(): string {
  return `${window.location.origin}${window.location.pathname}`
}

/**
 * Mirrors the local library into Postgres and back. The local copy stays the
 * source of truth for the open session: nothing here runs until someone signs
 * in, the SDK is not even downloaded until then, and signing out leaves every
 * song on the device.
 */
export function useCloudSync(
  state: AppState,
  onRemote: (patch: Partial<AppState>) => void,
): CloudControl {
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [stage, setStage] = useState<AuthStage>(() =>
    cloudConfigured && shouldResumeSession() ? 'loading' : 'signed-out',
  )
  const [email, setEmail] = useState<string | null>(null)
  const [status, setStatus] = useState<CloudStatus>('signed-out')
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [otherAccount, setOtherAccount] = useState(false)
  const [recovery, setRecovery] = useState(false)

  const stateRef = useRef(state)
  stateRef.current = state
  const stageRef = useRef(stage)
  stageRef.current = stage
  const onRemoteRef = useRef(onRemote)
  onRemoteRef.current = onRemote
  const clientRef = useRef<SupabaseClient | null>(null)
  const userId = useRef<string | null>(null)
  const mismatch = useRef<string | null>(null)

  const engineRef = useRef<SyncEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = createSyncEngine({
      getClient: () => clientRef.current,
      getUserId: () => userId.current,
      isSignedIn: () => stageRef.current === 'signed-in' && !mismatch.current,
      getState: () => stateRef.current,
      apply: (patch) => onRemoteRef.current(patch),
      onStatus: (next) => setStatus(next),
      onSynced: (at) => setLastSyncedAt(at),
      onError: (message) => setError(message),
    })
  }

  const clearCloud = useCallback(() => {
    engineRef.current?.reset()
    setStatus('signed-out')
    setLastSyncedAt(null)
  }, [])

  /* ------------------------------- session -------------------------------- */

  const ensureClient = useCallback(async (): Promise<SupabaseClient | null> => {
    if (!cloudConfigured) return null
    if (clientRef.current) return clientRef.current
    try {
      const supabase = await loadSupabase()
      if (!supabase) return null
      clientRef.current = supabase
      setClient(supabase)
      return supabase
    } catch {
      setStage('signed-out')
      setError('Could not load the sync library. Check your connection and try again.')
      return null
    }
  }, [])

  const requireClient = useCallback(async (): Promise<SupabaseClient> => {
    const supabase = await ensureClient()
    if (!supabase) throw new Error('Cloud sync is not configured in this build.')
    return supabase
  }, [ensureClient])

  const adopt = useCallback(
    (session: { user: { id: string; email?: string | null } } | null) => {
      const id = session?.user.id ?? null
      userId.current = id
      setEmail(session?.user.email ?? null)

      if (!id) {
        mismatch.current = null
        setOtherAccount(false)
        setStage('signed-out')
        clearCloud()
        return
      }

      // A different account than the one this browser last mirrored: stop before
      // uploading someone else's library into it.
      const stored = loadOwnerId()
      if (stored && stored !== id) {
        mismatch.current = stored
        setOtherAccount(true)
      } else {
        mismatch.current = null
        setOtherAccount(false)
        if (!stored) saveOwnerId(id)
      }
      setStage('signed-in')
    },
    [clearCloud],
  )

  // A stored session is the only reason to download the SDK on load.
  useEffect(() => {
    if (stage !== 'loading') return
    void ensureClient()
  }, [stage, ensureClient])

  useEffect(() => {
    if (!client) return
    let alive = true
    void client.auth.getSession().then(({ data }) => {
      if (alive) adopt(data.session)
    })
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      adopt(session)
    })
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [client, adopt])

  /* --------------------------------- sync --------------------------------- */

  // One full pass when a session appears, then keep it fresh.
  useEffect(() => {
    if (stage !== 'signed-in' || otherAccount) return
    void engineRef.current?.sync('full')

    const poll = () => {
      if (document.visibilityState === 'visible') void engineRef.current?.sync('full')
    }
    const offline = () => setStatus('offline')
    const timer = window.setInterval(poll, POLL_MS)
    document.addEventListener('visibilitychange', poll)
    window.addEventListener('online', poll)
    window.addEventListener('offline', offline)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
      window.removeEventListener('online', poll)
      window.removeEventListener('offline', offline)
    }
  }, [stage, otherAccount])

  // Local edits go up after a quiet moment, not per keystroke.
  useEffect(() => {
    if (stage !== 'signed-in' || otherAccount) return
    const timer = window.setTimeout(() => void engineRef.current?.sync('push'), PUSH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [state, stage, otherAccount])

  // The other device's edits arrive as they happen; polling is only the fallback.
  useEffect(() => {
    if (!client || stage !== 'signed-in' || otherAccount) return
    if (!userId.current) return
    let timer = 0
    const channel = client
      .channel(`songs:${userId.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'songs' },
        () => {
          window.clearTimeout(timer)
          timer = window.setTimeout(() => void engineRef.current?.sync('full'), 400)
        },
      )
      .subscribe()
    return () => {
      window.clearTimeout(timer)
      void client.removeChannel(channel)
    }
  }, [client, stage, otherAccount])

  /* --------------------------------- auth --------------------------------- */

  const signIn = useCallback(
    async (rawEmail: string, password: string) => {
      if (!cloudConfigured) return 'Cloud sync is not configured in this build.'
      setError(null)
      const supabase = await ensureClient()
      if (!supabase) return 'Could not reach the sign-in service. Try again in a moment.'
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: rawEmail.trim(),
        password,
      })
      return signInError ? authMessage(signInError.message) : null
    },
    [ensureClient],
  )

  const signUp = useCallback(
    async (rawEmail: string, password: string) => {
      if (!cloudConfigured) return { error: 'Cloud sync is not configured in this build.', notice: null }
      setError(null)
      const supabase = await ensureClient()
      if (!supabase) return { error: 'Could not reach the sign-in service. Try again in a moment.', notice: null }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: rawEmail.trim(),
        password,
        options: { emailRedirectTo: returnTo() },
      })
      if (signUpError) return { error: authMessage(signUpError.message), notice: null }
      if (!data.session) {
        return {
          error: null,
          notice: 'Account created. Confirm your email, then sign in here.',
        }
      }
      return { error: null, notice: null }
    },
    [ensureClient],
  )

  const signOut = useCallback(async () => {
    await clientRef.current?.auth.signOut()
    clearCloud()
    setEmail(null)
    setRecovery(false)
    setOtherAccount(false)
    mismatch.current = null
    setStage('signed-out')
  }, [clearCloud])

  const requestPasswordReset = useCallback(
    async (rawEmail: string) => {
      if (!cloudConfigured) return 'Cloud sync is not configured in this build.'
      setError(null)
      const supabase = await ensureClient()
      if (!supabase) return 'Could not reach the sign-in service. Try again in a moment.'
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(rawEmail.trim(), {
        redirectTo: returnTo(),
      })
      return resetError ? authMessage(resetError.message) : null
    },
    [ensureClient],
  )

  const updatePassword = useCallback(
    async (password: string) => {
      const supabase = await ensureClient()
      if (!supabase) return 'Could not reach the sign-in service. Try again in a moment.'
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) return authMessage(updateError.message)
      setRecovery(false)
      return null
    },
    [ensureClient],
  )

  const finishRecovery = useCallback(() => setRecovery(false), [])

  const syncNow = useCallback(async () => {
    if (stage === 'signed-in' && !otherAccount) await engineRef.current?.sync('full')
  }, [stage, otherAccount])

  /**
   * Keep this device's library and attach it to the account just signed in — the
   * songs are uploaded and merged like any other first sync.
   */
  const keepDeviceLibrary = useCallback(() => {
    const id = userId.current
    if (!id) return
    saveOwnerId(id)
    mismatch.current = null
    setOtherAccount(false)
  }, [])

  /**
   * Start from the account's library instead. The old songs are still exportable
   * until they are cleared, which is why the sheet offers a backup first.
   */
  const startFromAccount = useCallback(() => {
    const id = userId.current
    if (!id) return
    saveOwnerId(id)
    mismatch.current = null
    engineRef.current?.reset()
    onRemoteRef.current({
      songs: [],
      folders: ['Drafts', 'Singles', 'EP'],
      vault: [],
      lexicon: {},
      lexiconAt: {},
      removedVault: {},
      removedLexicon: {},
    })
    setOtherAccount(false)
  }, [])

  const resolveAccount = useCallback(
    (choice: 'keep' | 'clean') => {
      if (choice === 'keep') keepDeviceLibrary()
      else startFromAccount()
    },
    [keepDeviceLibrary, startFromAccount],
  )

  /** Erase this account's cloud copy, then sign out. Local songs stay. */
  const eraseCloudCopy = useCallback(async () => {
    const supabase = await ensureClient()
    if (!supabase) return 'Could not reach the cloud. Try again in a moment.'
    const { error: eraseError } = await supabase.rpc('delete_my_data')
    if (eraseError) return messageOf(eraseError, 'The cloud copy could not be erased. Try again.')
    saveOwnerId(null)
    await signOut()
    return null
  }, [ensureClient, signOut])

  /* -------------------------------- sharing -------------------------------- */

  const sharing = useMemo<CloudSharing>(
    () => ({
      createInvite: async (songId, role) => createInviteRow(await requireClient(), songId, role),
      accept: async (token) => {
        const joined = await acceptInviteRow(await requireClient(), token)
        // The song can be older than this device's last sync, so read from the top.
        if (joined) await engineRef.current?.refresh()
        return joined
      },
      members: async (songId) => listMembers(await requireClient(), songId),
      remove: async (songId, memberId) => removeMemberRow(await requireClient(), songId, memberId),
    }),
    [requireClient],
  )

  return {
    configured: cloudConfigured,
    stage,
    email,
    status,
    lastSyncedAt,
    error,
    otherAccount,
    recovery,
    signIn,
    signUp,
    signOut,
    syncNow,
    requestPasswordReset,
    updatePassword,
    finishRecovery,
    resolveAccount,
    eraseCloudCopy,
    sharing,
  }
}
