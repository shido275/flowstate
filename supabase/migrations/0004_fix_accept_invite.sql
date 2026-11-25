-- Fix accept_song_invite.
--
-- `returns table (song_id text, title text)` creates plpgsql variables named
-- song_id and title, and plpgsql resolves the bare `song_id` in the INSERT's
-- column list to the variable, which Postgres rejects as ambiguous (42702) the
-- first time somebody accepts a link. `use_column` makes every bare name a
-- column; the function's own variables are already qualified.
create or replace function public.accept_song_invite(p_token uuid)
returns table (song_id text, title text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
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

revoke all on function public.accept_song_invite(uuid) from public;
grant execute on function public.accept_song_invite(uuid) to authenticated;
