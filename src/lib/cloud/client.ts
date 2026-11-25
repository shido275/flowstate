import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

/** Builds without cloud credentials simply never show the sync UI. */
export const cloudConfigured = Boolean(url && key)

let pending: Promise<SupabaseClient | null> | null = null

/**
 * The SDK is about a quarter of a megabyte and the app is complete without it,
 * so it is fetched only once something actually needs a session. The type import
 * above is erased at build time, which is what lets the bundler split it out.
 *
 * PKCE flow because the app routes on the hash (#/song/<id>): the callback
 * carries ?code= in the query string and never disturbs location.hash.
 */
export function loadSupabase(): Promise<SupabaseClient | null> {
  if (pending) return pending
  const endpoint = url
  const token = key
  if (!endpoint || !token) {
    pending = Promise.resolve(null)
    return pending
  }
  pending = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(endpoint, token, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    }),
  )
  return pending
}

/**
 * True when this browser may already be signed in: a stored Supabase session or
 * an auth callback in the URL. Checked before loading the SDK so a first-time
 * visitor pays nothing for a feature they have not asked for.
 */
export function shouldResumeSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const stored = localStorage.key(i)
      if (stored && stored.startsWith('sb-') && stored.endsWith('-auth-token')) return true
    }
  } catch {
    // Storage can be unavailable (private mode); fall through to the URL check.
  }
  return /[?&](code|error|error_description)=/.test(window.location.search)
}
