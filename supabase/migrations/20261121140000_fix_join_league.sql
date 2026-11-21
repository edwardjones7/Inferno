-- join_league: `select ... into t` sets t to null when there's no row for this week, so a
-- first-time joiner was inserted with a null tier. Look the row up into its own variable.
create or replace function public.join_league() returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk date := public.week_start(current_date);
  prev public.league_members;
  existing int;
  t int := 0;
  rnk int;
  size int;
  g int;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select tier into existing from public.league_members where week = wk and user_id = me;
  if found then return existing; end if;

  select * into prev from public.league_members where user_id = me and week < wk order by week desc limit 1;
  if found then
    t := prev.tier;
    if prev.week = wk - 7 then
      select r, n into rnk, size from (
        select user_id, rank() over (order by public.week_xp(user_id, prev.week) desc) as r, count(*) over () as n
        from public.league_members where week = prev.week and tier = prev.tier and grp = prev.grp
      ) ranked where user_id = me;
      if rnk <= 7 and public.week_xp(me, prev.week) > 0 then t := least(t + 1, 5);
      elsif size >= 10 and rnk > size - 5 then t := greatest(t - 1, 0);
      end if;
    end if;
  end if;

  -- serialise group assignment for this week and tier
  perform pg_advisory_xact_lock(hashtext('league' || wk::text || t::text));
  select grp into g from public.league_members where week = wk and tier = t
    group by grp having count(*) < 30 order by grp limit 1;
  if g is null then
    select coalesce(max(grp), 0) + 1 into g from public.league_members where week = wk and tier = t;
  end if;
  insert into public.league_members (week, user_id, tier, grp) values (wk, me, t, g);
  return t;
end $$;

grant execute on function public.join_league() to authenticated;
