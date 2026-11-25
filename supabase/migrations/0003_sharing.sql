-- Flowstate cloud sync — phase 2: share a song with another writer.
--
-- An invite is a random token in a URL. Accepting it inserts a song_members row,
-- which the phase-1 policies already honour for reading and editing. There is no
-- email delivery: the link is the whole mechanism, so nothing needs SMTP.

alter table public.song_members add column if not exists email text;

create table if not exists public.song_invites (
  token      uuid primary key default gen_random_uuid(),
  song_id    text not null references public.songs (id) on delete cascade,
  role       text not null default 'editor' check (role in ('editor', 'viewer')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

create index if not exists song_invites_song_idx on public.song_invites (song_id);

-- Only the RPCs below touch this table: enabling RLS with no policies closes it
-- to direct PostgREST calls while SECURITY DEFINER functions still work.
alter table public.song_invites enable row level security;

-- Create a link for a song you can edit. Returns the token to put in the URL.
create or replace function public.create_song_invite(p_song text, p_role text default 'editor')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := case when p_role in ('editor', 'viewer') then p_role else 'editor' end;
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to share a song';
  end if;
  if not public.can_edit_song(p_song) then
    raise exception 'You cannot share this song';
  end if;

  insert into public.song_invites (song_id, role, created_by)
  values (p_song, v_role, auth.uid())
  returning token into v_token;

  return v_token;
end;
$$;

-- Redeem a link. Idempotent: accepting twice just keeps the existing role.
create or replace function public.accept_song_invite(p_token uuid)
returns table (song_id text, title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.song_invites;
begin
  select * into v_invite
    from public.song_invites
   where token = p_token and expires_at > now();
  if not found then
    return;
  end if;
  if auth.uid() is null then
    raise exception 'Sign in to open that invite';
  end if;

  if not exists (select 1 from public.songs s where s.id = v_invite.song_id and s.owner = auth.uid()) then
    insert into public.song_members (song_id, user_id, role, email)
    values (
      v_invite.song_id,
      auth.uid(),
      v_invite.role,
      (select u.email::text from auth.users u where u.id = auth.uid())
    )
    on conflict (song_id, user_id) do update set role = excluded.role;
  end if;

  return query select s.id, s.title from public.songs s where s.id = v_invite.song_id;
end;
$$;

-- Who can see this song: the owner first, then everyone the link brought in.
create or replace function public.list_song_members(p_song text)
returns table (user_id uuid, email text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_song_member(p_song) then
    return;
  end if;

  return query
    select s.owner, coalesce(u.email::text, ''), 'owner'::text
      from public.songs s
      join auth.users u on u.id = s.owner
     where s.id = p_song
    union all
    select m.user_id, coalesce(m.email, ''), m.role
      from public.song_members m
     where m.song_id = p_song;
end;
$$;

-- Only the owner can take someone off a song.
create or replace function public.remove_song_member(p_song text, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.songs s where s.id = p_song and s.owner = auth.uid()
  ) then
    return false;
  end if;

  delete from public.song_members m
   where m.song_id = p_song and m.user_id = p_user;

  return found;
end;
$$;

revoke all on function public.create_song_invite(text, text) from public;
revoke all on function public.accept_song_invite(uuid) from public;
revoke all on function public.list_song_members(text) from public;
revoke all on function public.remove_song_member(text, uuid) from public;

grant execute on function public.create_song_invite(text, text) to authenticated;
grant execute on function public.accept_song_invite(uuid) to authenticated;
grant execute on function public.list_song_members(text) to authenticated;
grant execute on function public.remove_song_member(text, uuid) to authenticated;

-- Erase this account's cloud copy, now including the links it created.
create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'delete_my_data needs a signed-in user';
  end if;

  delete from public.song_invites where created_by = v_user;

  delete from public.song_members m
   using public.songs s
   where m.song_id = s.id and s.owner = v_user;

  delete from public.song_members where user_id = v_user;

  delete from public.songs where owner = v_user;
  delete from public.user_prefs where user_id = v_user;
end;
$$;

grant execute on function public.delete_my_data() to authenticated;

-- Live updates: the other device's edits arrive without waiting for a poll.
-- New and updated rows carry the full record, and the client never deletes rows
-- (purges travel as tombstones), so replica identity stays the default.
do $$
begin
  alter publication supabase_realtime add table public.songs;
exception
  when duplicate_object then null;
end;
$$;
