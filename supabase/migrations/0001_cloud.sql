-- Flowstate cloud sync — phase 1: accounts, one row per song, RLS.
-- Run in the Supabase SQL editor, or `supabase db push`.

create extension if not exists pgcrypto;

-- One row per song. The client keeps its own local id, so a pull never has to
-- remap ids between devices.
create table if not exists public.songs (
  id         text primary key,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  doc        jsonb not null,
  title      text not null default '',
  folder     text not null default 'Drafts',
  revision   bigint not null default 1,
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists songs_owner_idx on public.songs (owner);

-- Sharing groundwork. Nothing writes here yet; it exists so collaboration can
-- land later without reshaping the song table.
create table if not exists public.song_members (
  song_id    text not null references public.songs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (song_id, user_id)
);

-- Settings, folders, the snippet vault and taught pronunciations, one row each.
create table if not exists public.user_prefs (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  doc        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Membership checks are SECURITY DEFINER so policy evaluation on songs does not
-- recurse back into songs' own policy.
create or replace function public.is_song_member(p_song text, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.songs s where s.id = p_song and s.owner = p_user)
      or exists (select 1 from public.song_members m where m.song_id = p_song and m.user_id = p_user);
$$;

create or replace function public.can_edit_song(p_song text, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.songs s where s.id = p_song and s.owner = p_user)
      or exists (
        select 1 from public.song_members m
         where m.song_id = p_song and m.user_id = p_user and m.role in ('owner', 'editor')
      );
$$;

revoke all on function public.is_song_member(text, uuid) from public;
revoke all on function public.can_edit_song(text, uuid) from public;
grant execute on function public.is_song_member(text, uuid) to authenticated;
grant execute on function public.can_edit_song(text, uuid) to authenticated;

-- Every update bumps revision (the client's optimistic-concurrency token) and
-- the server timestamp.
create or replace function public.touch_song()
returns trigger
language plpgsql
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists songs_touch on public.songs;
create trigger songs_touch
  before update on public.songs
  for each row execute function public.touch_song();

create or replace function public.touch_prefs()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_prefs_touch on public.user_prefs;
create trigger user_prefs_touch
  before update on public.user_prefs
  for each row execute function public.touch_prefs();

-- Push one song. Updates when the row is still on the revision this device last
-- saw, otherwise inserts. Returns no row on conflict so the client pulls first.
--
-- Two RLS quirks shape this body. `insert ... on conflict do nothing` fails the
-- insert policy with 42501 even for the owner, and `returning` on a fresh insert
-- re-checks the SELECT policy against a snapshot that cannot see the new row.
-- So: update first, insert plainly, then read the row back in its own statement.
create or replace function public.push_song(p_doc jsonb, p_expected bigint default null)
returns table (revision bigint, deleted boolean, updated_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_id text := p_doc ->> 'id';
begin
  if v_id is null or v_id = '' then
    raise exception 'push_song needs a doc.id';
  end if;

  return query
    update public.songs s
       set doc = p_doc,
           title = coalesce(p_doc ->> 'title', ''),
           folder = coalesce(p_doc ->> 'folder', 'Drafts'),
           deleted = (p_doc ? 'deletedAt')
     where s.id = v_id
       and (p_expected is null or s.revision = p_expected)
       and public.can_edit_song(s.id)
    returning s.revision, s.deleted, s.updated_at;

  if found then
    return;
  end if;

  -- Nothing updated: the song is either not here yet, or another device moved it.
  if exists (select 1 from public.songs s where s.id = v_id) then
    return;
  end if;

  begin
    insert into public.songs (id, owner, doc, title, folder, deleted)
    values (
      v_id,
      auth.uid(),
      p_doc,
      coalesce(p_doc ->> 'title', ''),
      coalesce(p_doc ->> 'folder', 'Drafts'),
      (p_doc ? 'deletedAt')
    );
  exception when unique_violation then
    return;
  end;

  return query
    select s.revision, s.deleted, s.updated_at from public.songs s where s.id = v_id;
end;
$$;

grant execute on function public.push_song(jsonb, bigint) to authenticated;

alter table public.songs enable row level security;
alter table public.song_members enable row level security;
alter table public.user_prefs enable row level security;

drop policy if exists songs_read on public.songs;
create policy songs_read on public.songs
  for select to authenticated
  using (public.is_song_member(id));

drop policy if exists songs_insert on public.songs;
create policy songs_insert on public.songs
  for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists songs_update on public.songs;
create policy songs_update on public.songs
  for update to authenticated
  using (public.can_edit_song(id))
  with check (public.can_edit_song(id));

drop policy if exists songs_delete on public.songs;
create policy songs_delete on public.songs
  for delete to authenticated
  using (owner = auth.uid());

drop policy if exists members_read on public.song_members;
create policy members_read on public.song_members
  for select to authenticated
  using (public.is_song_member(song_id));

drop policy if exists members_owner_write on public.song_members;
create policy members_owner_write on public.song_members
  for all to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id and s.owner = auth.uid()))
  with check (exists (select 1 from public.songs s where s.id = song_id and s.owner = auth.uid()));

drop policy if exists prefs_own on public.user_prefs;
create policy prefs_own on public.user_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
