-- Review locally; deploying this migration is a separate release operation.
begin;
alter table public.surf_market_history drop constraint if exists surf_market_history_sport_key_check;
alter table public.surf_market_history add constraint surf_market_history_sport_key_check
  check (sport_key in ('americanfootball_nfl_preseason','americanfootball_nfl','baseball_mlb','americanfootball_ncaaf'));
alter table public.surf_rope_audit_runs drop constraint if exists surf_rope_audit_runs_sport_key_check;
alter table public.surf_rope_audit_runs add constraint surf_rope_audit_runs_sport_key_check
  check (sport_key in ('americanfootball_nfl_preseason','americanfootball_nfl','baseball_mlb','americanfootball_ncaaf'));
create or replace function public.record_surf_market_history(
  p_games jsonb,
  p_observed_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_game record;
  v_previous numeric;
  v_previous_observed_at timestamptz;
  v_has_previous boolean;
  v_inserted integer := 0;
  v_row_count integer;
begin
  if p_observed_at is null then
    raise exception using errcode = '22023', message = 'p_observed_at is required';
  end if;
  if p_observed_at > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'p_observed_at is too far in the future';
  end if;
  if jsonb_typeof(p_games) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'p_games must be a JSON array';
  end if;
  if jsonb_array_length(p_games) > 64 then
    raise exception using errcode = '22023', message = 'p_games exceeds the 64-game batch limit';
  end if;
  if (
    select count(*) <> count(distinct jsonb_build_array(item->>'sport_key', item->>'game_id'))
    from jsonb_array_elements(p_games) as item
  ) then
    raise exception using errcode = '22023', message = 'p_games contains duplicate game ids';
  end if;

  for v_game in
    select *
    from jsonb_to_recordset(p_games) as x(
      sport_key text,
      game_id text,
      game_key text,
      commence_time timestamptz,
      home_team text,
      away_team text,
      spread_value numeric,
      spread_books integer,
      total_value numeric,
      total_books integer
    )
    order by sport_key, game_id
  loop
    if v_game.sport_key is null
      or v_game.sport_key not in ('americanfootball_nfl_preseason', 'americanfootball_nfl', 'baseball_mlb', 'americanfootball_ncaaf')
      or nullif(btrim(v_game.game_id), '') is null
      or nullif(btrim(v_game.game_key), '') is null
      or v_game.commence_time is null
      or nullif(btrim(v_game.home_team), '') is null
      or nullif(btrim(v_game.away_team), '') is null
      or v_game.home_team = v_game.away_team then
      raise exception using errcode = '22023', message = 'market history game metadata is invalid';
    end if;
    if coalesce(v_game.spread_books, 0) not between 0 and 100
      or coalesce(v_game.total_books, 0) not between 0 and 100 then
      raise exception using errcode = '22023', message = 'market history book count is invalid';
    end if;
    if (v_game.spread_value is not null and abs(v_game.spread_value) > 999)
      or (v_game.total_value is not null and abs(v_game.total_value) > 999) then
      raise exception using errcode = '22023', message = 'market history line is outside the accepted range';
    end if;

    if v_game.spread_value is not null then
      perform pg_advisory_xact_lock(
        hashtextextended(v_game.sport_key || ':' || v_game.game_id || ':spreads', 0)
      );
      select history.line_value, history.observed_at
        into v_previous, v_previous_observed_at
      from public.surf_market_history as history
      where history.sport_key = v_game.sport_key
        and history.game_id = v_game.game_id
        and history.market = 'spreads'
      order by history.observed_at desc, history.id desc
      limit 1;
      v_has_previous := found;

      if (not v_has_previous or p_observed_at >= v_previous_observed_at)
        and (not v_has_previous or abs(v_previous - v_game.spread_value) >= 0.25) then
        insert into public.surf_market_history (
          sport_key, game_id, game_key, commence_time, home_team, away_team,
          market, line_value, books_count, observed_at, is_opening
        ) values (
          v_game.sport_key, v_game.game_id, v_game.game_key, v_game.commence_time,
          v_game.home_team, v_game.away_team, 'spreads', v_game.spread_value,
          coalesce(v_game.spread_books, 0), p_observed_at, not v_has_previous
        ) on conflict (sport_key, game_id, market, observed_at) do nothing;
        get diagnostics v_row_count = row_count;
        v_inserted := v_inserted + v_row_count;
      end if;
    end if;

    if v_game.total_value is not null then
      perform pg_advisory_xact_lock(
        hashtextextended(v_game.sport_key || ':' || v_game.game_id || ':totals', 0)
      );
      select history.line_value, history.observed_at
        into v_previous, v_previous_observed_at
      from public.surf_market_history as history
      where history.sport_key = v_game.sport_key
        and history.game_id = v_game.game_id
        and history.market = 'totals'
      order by history.observed_at desc, history.id desc
      limit 1;
      v_has_previous := found;

      if (not v_has_previous or p_observed_at >= v_previous_observed_at)
        and (not v_has_previous or abs(v_previous - v_game.total_value) >= 0.25) then
        insert into public.surf_market_history (
          sport_key, game_id, game_key, commence_time, home_team, away_team,
          market, line_value, books_count, observed_at, is_opening
        ) values (
          v_game.sport_key, v_game.game_id, v_game.game_key, v_game.commence_time,
          v_game.home_team, v_game.away_team, 'totals', v_game.total_value,
          coalesce(v_game.total_books, 0), p_observed_at, not v_has_previous
        ) on conflict (sport_key, game_id, market, observed_at) do nothing;
        get diagnostics v_row_count = row_count;
        v_inserted := v_inserted + v_row_count;
      end if;
    end if;
  end loop;

  return v_inserted;
end;
$$;


create table if not exists public.surf_cfb_observations (
  sport_key text not null default 'americanfootball_ncaaf' check (sport_key = 'americanfootball_ncaaf'),
  game_id text not null,
  observed_at timestamptz not null,
  commence_time timestamptz not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 500000),
  signals jsonb not null default '[]' check (jsonb_typeof(signals) = 'array'),
  sources jsonb not null default '{}' check (jsonb_typeof(sources) = 'object'),
  primary key (sport_key, game_id, observed_at, fingerprint)
);
create index if not exists surf_cfb_observations_close_idx
  on public.surf_cfb_observations (sport_key, game_id, commence_time, observed_at desc);
create index if not exists surf_cfb_observations_cursor_idx
  on public.surf_cfb_observations (sport_key, observed_at desc, game_id, fingerprint);
create table if not exists public.surf_cfb_results (
  sport_key text not null default 'americanfootball_ncaaf' check (sport_key = 'americanfootball_ncaaf'),
  provider_game_id bigint not null,
  season integer not null check (season >= 2026),
  commence_time timestamptz not null,
  home_team_id bigint not null,
  away_team_id bigint not null check (home_team_id <> away_team_id),
  home_score smallint not null check (home_score between 0 and 200),
  away_score smallint not null check (away_score between 0 and 200),
  status text not null check (status in ('FT','AOT')),
  stage text,
  observed_at timestamptz not null,
  primary key (sport_key, provider_game_id)
);
create index if not exists surf_cfb_results_season_idx
  on public.surf_cfb_results (sport_key, season, commence_time, provider_game_id);
alter table public.surf_cfb_observations enable row level security;
alter table public.surf_cfb_results enable row level security;
revoke all on public.surf_cfb_observations, public.surf_cfb_results from public, anon, authenticated, service_role;
grant select, insert on public.surf_cfb_observations to service_role;
grant select, insert, update on public.surf_cfb_results to service_role;

-- Last observed pregame quote, never represented as an official sportsbook close.
create or replace view public.surf_cfb_pregame_context with (security_invoker = true) as
  select distinct on (sport_key, game_id, commence_time) sport_key, game_id, commence_time,
    observed_at, snapshot, sources
  from public.surf_cfb_observations where observed_at < commence_time
  order by sport_key, game_id, commence_time, observed_at desc, fingerprint;
revoke all on public.surf_cfb_pregame_context from public, anon, authenticated, service_role;
grant select on public.surf_cfb_pregame_context to service_role;

create or replace function public.surf_cfb_memory_health() returns boolean
language sql stable security invoker set search_path = '' as $$
  select to_regclass('public.surf_cfb_observations') is not null
    and to_regclass('public.surf_cfb_results') is not null
    and has_table_privilege(current_user,'public.surf_cfb_observations','select,insert')
    and not has_table_privilege('anon','public.surf_cfb_observations','select')
    and not has_table_privilege('authenticated','public.surf_cfb_results','select');
$$;
revoke all on function public.surf_cfb_memory_health() from public, anon, authenticated, service_role;
grant execute on function public.surf_cfb_memory_health() to service_role;
create or replace function public.load_surf_cfb_latest(p_game_ids text[], p_before timestamptz)
returns table (snapshot jsonb, observed_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select latest.snapshot, latest.observed_at from (
    select distinct on (o.game_id) o.snapshot, o.observed_at
    from public.surf_cfb_observations o
    where o.sport_key = 'americanfootball_ncaaf'
      and cardinality(p_game_ids) <= 256 and o.game_id = any(p_game_ids)
      and o.observed_at < p_before and o.observed_at >= p_before - interval '3 hours'
    order by o.game_id, o.observed_at desc, o.fingerprint
  ) latest order by latest.observed_at;
$$;
revoke all on function public.load_surf_cfb_latest(text[],timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.load_surf_cfb_latest(text[],timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
