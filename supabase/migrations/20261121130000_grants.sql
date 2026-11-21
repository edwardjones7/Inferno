-- Explicit privileges. New Supabase projects no longer grant table access to the API roles
-- by default, so each table states what signed-in players may do; row level security (in
-- the previous migration) then narrows that to their own rows. Nothing is granted to anon:
-- every online feature needs an account.

grant usage on schema public to authenticated, service_role;

grant select, insert, update on public.profiles to authenticated;
grant select on public.friend_codes to authenticated;
grant select, insert, update, delete on public.progress_backups to authenticated;
grant select, delete on public.friendships to authenticated;
grant select, insert, update on public.day_stats to authenticated;
grant select on public.league_members to authenticated;
grant select, insert, update, delete on public.shared_hands to authenticated;
grant select on public.live_tables, public.live_seats, public.live_private, public.live_hands to authenticated;
-- table_secrets: nothing for players, on purpose

-- the `table` and `account` edge functions
grant all on all tables in schema public to service_role;

grant execute on function
  public.add_friend(text),
  public.accept_friend(uuid),
  public.join_league(),
  public.league_board(),
  public.are_friends(uuid, uuid),
  public.seated_at(uuid, uuid),
  public.week_start(date),
  public.week_xp(uuid, date)
to authenticated;
