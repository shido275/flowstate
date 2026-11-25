-- Flowstate cloud sync — phase 1 hardening.
--
-- Three changes:
--   * a purge is now a tombstone (deletedAt / purgedAt in the doc) that keeps its
--     row, so a second device cannot resurrect a song nobody wants;
--   * pushes are capped, so one account cannot fill the database;
--   * delete_my_data() lets someone erase their cloud copy without support.

-- Faster incremental pulls (the client asks for rows newer than the last it saw).
create index if not exists songs_owner_updated_idx on public.songs (owner, updated_at desc);

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
  v_bytes int := pg_column_size(p_doc);
  -- Comfortably above a full song with its drafts and notes, low enough that a
  -- script cannot use one row as free storage.
  v_max_bytes constant int := 262144;
  -- Two thousand songs is far more than a writer needs and keeps one free-plan
  -- account from consuming the whole database.
  v_max_songs constant int := 2000;
begin
  if v_id is null or v_id = '' then
    raise exception 'push_song needs a doc.id';
  end if;
  if v_bytes > v_max_bytes then
    raise exception 'That song is too large to sync (limit 256 KB)';
  end if;

  return query
    update public.songs s
       set doc = p_doc,
           title = coalesce(p_doc ->> 'title', ''),
           folder = coalesce(p_doc ->> 'folder', 'Drafts'),
           deleted = (p_doc ? 'deletedAt') or (p_doc ? 'purgedAt')
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

  if (select count(*) from public.songs s where s.owner = auth.uid()) >= v_max_songs then
    raise exception 'This account has reached its % song limit', v_max_songs;
  end if;

  begin
    insert into public.songs (id, owner, doc, title, folder, deleted)
    values (
      v_id,
      auth.uid(),
      p_doc,
      coalesce(p_doc ->> 'title', ''),
      coalesce(p_doc ->> 'folder', 'Drafts'),
      (p_doc ? 'deletedAt') or (p_doc ? 'purgedAt')
    );
  exception when unique_violation then
    return;
  end;

  return query
    select s.revision, s.deleted, s.updated_at from public.songs s where s.id = v_id;
end;
$$;

-- Erase this account's cloud copy. Local devices are untouched: they keep every
-- song and simply stop mirroring. SECURITY DEFINER so the cascading deletes do
-- not depend on the caller's RLS visibility, and it only ever touches auth.uid().
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

  -- Membership rows for songs this user owns (the songs FK would cascade, but
  -- be explicit: it also covers invites and rows added later).
  delete from public.song_members m
   using public.songs s
   where m.song_id = s.id and s.owner = v_user;

  -- Memberships in other people's songs.
  delete from public.song_members where user_id = v_user;

  delete from public.songs where owner = v_user;
  delete from public.user_prefs where user_id = v_user;
end;
$$;

grant execute on function public.delete_my_data() to authenticated;
