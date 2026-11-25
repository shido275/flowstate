import type { SupabaseClient } from '@supabase/supabase-js'

export type ShareRole = 'editor' | 'viewer'

export interface SongMember {
  userId: string
  email: string
  role: 'owner' | ShareRole
}

function rows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  return data ? [data as T] : []
}

/** A link anybody with the URL can redeem once they are signed in. */
export function inviteUrl(token: string): string {
  const url = new URL(window.location.href)
  url.hash = ''
  url.search = `?invite=${encodeURIComponent(token)}`
  return url.toString()
}

export async function createInvite(
  client: SupabaseClient,
  songId: string,
  role: ShareRole,
): Promise<string> {
  const { data, error } = await client.rpc('create_song_invite', {
    p_song: songId,
    p_role: role,
  })
  if (error) throw error
  const token = typeof data === 'string' ? data : null
  if (!token) throw new Error('The invite link could not be created.')
  return token
}

export async function acceptInvite(
  client: SupabaseClient,
  token: string,
): Promise<{ songId: string; title: string } | null> {
  const { data, error } = await client.rpc('accept_song_invite', { p_token: token })
  if (error) throw error
  const row = rows<{ song_id: string; title: string }>(data)[0]
  return row ? { songId: row.song_id, title: row.title } : null
}

export async function listMembers(
  client: SupabaseClient,
  songId: string,
): Promise<SongMember[]> {
  const { data, error } = await client.rpc('list_song_members', { p_song: songId })
  if (error) throw error
  return rows<{ user_id: string; email: string; role: SongMember['role'] }>(data).map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role,
  }))
}

export async function removeMember(
  client: SupabaseClient,
  songId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('remove_song_member', {
    p_song: songId,
    p_user: userId,
  })
  if (error) throw error
  return Boolean(data)
}
