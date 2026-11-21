-- Inferno online: optional accounts, cloud backup, friends, puzzle duels, friend streaks,
-- weekly leagues, shared hands, and live private tables with friends.
--
-- Ground rules (AGENTS.md):
-- * Accounts are optional. Everything here is an extra on top of offline play.
-- * Chips never move between users. Live tables use table-only chips that live and die
--   with the table; nothing here reads or writes a player's chip balance.
-- * Clients are not trusted with hidden information: live-table state that players must not
--   see (the deck, other players' hole cards) sits in `table_secrets`, which has row level
--   security on and no policies, so only the `table` edge function (service role) reads it.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  streak int not null default 0 check (streak >= 0),
  best_streak int not null default 0 check (best_streak >= 0),
  ratings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Names, streaks and ratings are what friends and league rivals see; nothing private.
create policy "profiles are readable when signed in" on public.profiles
  for select to authenticated using (true);
create policy "you edit your own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "you create your own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- Friend codes are kept apart so nobody can list everyone's code and spam requests.
create table public.friend_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z2-9]{8}$')
);

alter table public.friend_codes enable row level security;
create policy "you see your own code" on public.friend_codes
  for select to authenticated using (user_id = auth.uid());

create or replace function public.new_friend_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.friend_codes where code = c);
  end loop;
  return c;
end $$;

-- A profile and a friend code for every new account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'name', 24), ''), 'Player'))
  on conflict (id) do nothing;
  insert into public.friend_codes (user_id, code) values (new.id, public.new_friend_code())
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ cloud backup

-- The whole on-device progress document, so progress survives a new phone.
create table public.progress_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null check (octet_length(doc::text) < 4000000),
  device text,
  updated_at timestamptz not null default now()
);

alter table public.progress_backups enable row level security;
create policy "you own your backup" on public.progress_backups
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------------ friends

create table public.friendships (
  user_low uuid not null references auth.users (id) on delete cascade,
  user_high uuid not null references auth.users (id) on delete cascade,
  requester uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requester in (user_low, user_high))
);

create index friendships_high on public.friendships (user_high);

alter table public.friendships enable row level security;
create policy "you see your friendships" on public.friendships
  for select to authenticated using (auth.uid() in (user_low, user_high));
create policy "either side can remove a friendship" on public.friendships
  for delete to authenticated using (auth.uid() in (user_low, user_high));

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where user_low = least(a, b) and user_high = greatest(a, b) and status = 'accepted'
  )
$$;

-- Send a request by friend code. If they already asked you, this accepts it.
create or replace function public.add_friend(friend_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  them uuid;
  fr public.friendships;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select user_id into them from public.friend_codes where code = upper(trim(friend_code));
  if them is null then raise exception 'No player has that code'; end if;
  if them = me then raise exception 'That''s your own code'; end if;

  select * into fr from public.friendships where user_low = least(me, them) and user_high = greatest(me, them);
  if found then
    if fr.status = 'accepted' then return 'already'; end if;
    if fr.requester = them then
      update public.friendships set status = 'accepted' where user_low = fr.user_low and user_high = fr.user_high;
      return 'accepted';
    end if;
    return 'pending';
  end if;

  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 50 then
    raise exception 'Too many requests waiting. Try again later';
  end if;
  insert into public.friendships (user_low, user_high, requester) values (least(me, them), greatest(me, them), me);
  return 'sent';
end $$;

create or replace function public.accept_friend(other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.friendships set status = 'accepted'
  where user_low = least(auth.uid(), other) and user_high = greatest(auth.uid(), other)
    and requester = other and status = 'pending';
  if not found then raise exception 'No request from that player'; end if;
end $$;

-- ------------------------------------------------------------------ daily stats

-- One row per player per local day: XP toward the goal, whether it was met, and the daily
-- puzzle answers (for duels). Friends can read each other's rows.
create table public.day_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  xp int not null default 0 check (xp between 0 and 2000),
  goal_met boolean not null default false,
  puzzles jsonb check (puzzles is null or jsonb_typeof(puzzles) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  -- a client may only write days around its own today
  check (day between date '2026-01-01' and date '2100-01-01')
);

alter table public.day_stats enable row level security;
create policy "you and your friends see daily stats" on public.day_stats
  for select to authenticated using (user_id = auth.uid() or public.are_friends(user_id, auth.uid()));
create policy "you write your own recent days" on public.day_stats
  for insert to authenticated
  with check (user_id = auth.uid() and day between current_date - 2 and current_date + 1);
create policy "you update your own recent days" on public.day_stats
  for update to authenticated
  using (user_id = auth.uid() and day between current_date - 2 and current_date + 1)
  with check (user_id = auth.uid() and day between current_date - 2 and current_date + 1);

-- ------------------------------------------------------------------ weekly leagues

-- Groups of up to 30 players at the same tier compete on weekly XP. Tiers move lazily: when
-- you join a new week, last week's finish decides it (top 7 up, bottom 5 down).
create table public.league_members (
  week date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  tier int not null check (tier between 0 and 5),
  grp int not null,
  joined_at timestamptz not null default now(),
  primary key (week, user_id)
);

create index league_groups on public.league_members (week, tier, grp);

alter table public.league_members enable row level security;
create policy "you see your league rows" on public.league_members
  for select to authenticated using (user_id = auth.uid());

create or replace function public.week_start(d date) returns date
language sql immutable as $$ select d - (extract(isodow from d)::int - 1) $$;

create or replace function public.week_xp(uid uuid, wk date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(xp), 0)::int from public.day_stats where user_id = uid and day between wk and wk + 6
$$;

-- Join this week's league (idempotent). Returns the tier.
create or replace function public.join_league() returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk date := public.week_start(current_date);
  prev public.league_members;
  t int := 0;
  rnk int;
  size int;
  g int;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select tier into t from public.league_members where week = wk and user_id = me;
  if found then return t; end if;

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

-- Your group's standings this week.
create or replace function public.league_board()
returns table (user_id uuid, name text, xp int, tier int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select week, tier, grp from public.league_members
    where user_id = auth.uid() and week = public.week_start(current_date)
  )
  select m.user_id, p.name, public.week_xp(m.user_id, m.week), m.tier, m.user_id = auth.uid()
  from public.league_members m
  join mine on m.week = mine.week and m.tier = mine.tier and m.grp = mine.grp
  join public.profiles p on p.id = m.user_id
  order by 3 desc, p.name
$$;

-- ------------------------------------------------------------------ shared hands

create table public.shared_hands (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  game text not null check (game in ('poker', 'blackjack')),
  hand jsonb not null check (octet_length(hand::text) < 200000),
  note text check (char_length(note) <= 280),
  seen boolean not null default false,
  created_at timestamptz not null default now()
);

create index shared_hands_recipient on public.shared_hands (recipient, created_at desc);

alter table public.shared_hands enable row level security;
create policy "sender and recipient see a shared hand" on public.shared_hands
  for select to authenticated using (auth.uid() in (sender, recipient));
create policy "you share hands with friends" on public.shared_hands
  for insert to authenticated with check (sender = auth.uid() and public.are_friends(sender, recipient));
create policy "the recipient marks it seen" on public.shared_hands
  for update to authenticated using (recipient = auth.uid()) with check (recipient = auth.uid());
create policy "either side deletes it" on public.shared_hands
  for delete to authenticated using (auth.uid() in (sender, recipient));

-- ------------------------------------------------------------------ live tables

create table public.live_tables (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  game text not null check (game in ('poker', 'blackjack')),
  host uuid not null references auth.users (id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'closed')),
  settings jsonb not null default '{}'::jsonb,
  -- what every seated player may see (no deck, no other player's hole cards)
  public jsonb,
  version int not null default 0,
  deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.live_seats (
  table_id uuid not null references public.live_tables (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seat int not null check (seat between 0 and 5),
  name text not null,
  left_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (table_id, user_id),
  unique (table_id, seat)
);

-- Each player's own hidden cards.
create table public.live_private (
  table_id uuid not null references public.live_tables (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (table_id, user_id)
);

-- Full engine state: deck, every hole card. Service role only.
create table public.table_secrets (
  table_id uuid primary key references public.live_tables (id) on delete cascade,
  state jsonb not null
);

-- Finished hands with every card face up, for the joint review once the table closes.
create table public.live_hands (
  table_id uuid not null references public.live_tables (id) on delete cascade,
  hand_no int not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  primary key (table_id, hand_no)
);

create or replace function public.seated_at(t uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.live_seats where table_id = t and user_id = uid)
$$;

alter table public.live_tables enable row level security;
alter table public.live_seats enable row level security;
alter table public.live_private enable row level security;
alter table public.table_secrets enable row level security;
alter table public.live_hands enable row level security;

create policy "seated players see the table" on public.live_tables
  for select to authenticated using (public.seated_at(id, auth.uid()));
create policy "seated players see the seats" on public.live_seats
  for select to authenticated using (public.seated_at(table_id, auth.uid()));
create policy "you see your own hidden cards" on public.live_private
  for select to authenticated using (user_id = auth.uid());
create policy "players review hands once the table closes" on public.live_hands
  for select to authenticated using (
    public.seated_at(table_id, auth.uid())
    and exists (select 1 from public.live_tables t where t.id = table_id and t.status = 'closed')
  );
-- table_secrets: no policies on purpose.

-- Writes to live tables go through the `table` edge function only.

-- ------------------------------------------------------------------ realtime

alter publication supabase_realtime add table public.live_tables;
alter publication supabase_realtime add table public.live_seats;
alter publication supabase_realtime add table public.live_private;
alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.shared_hands;

-- ------------------------------------------------------------------ backfill

-- Accounts created before this migration (sign-in works before the schema exists) get a
-- profile and a friend code too.
insert into public.profiles (id, name)
select id, coalesce(nullif(left(raw_user_meta_data ->> 'name', 24), ''), 'Player') from auth.users
on conflict (id) do nothing;

insert into public.friend_codes (user_id, code)
select u.id, public.new_friend_code() from auth.users u
where not exists (select 1 from public.friend_codes f where f.user_id = u.id);
