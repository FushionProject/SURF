-- Surf persistence schema version 2: bounded inputs, deterministic lock order,
-- explicit Data API grants, private ROPE storage, and a server-only health RPC.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'surf_market_history_sport_key_check'
      and conrelid = 'public.surf_market_history'::regclass
  ) then
    alter table public.surf_market_history
      add constraint surf_market_history_sport_key_check
      check (sport_key in ('americanfootball_nfl_preseason', 'americanfootball_nfl', 'baseball_mlb'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'surf_market_history_line_range_check'
      and conrelid = 'public.surf_market_history'::regclass
  ) then
    alter table public.surf_market_history
      add constraint surf_market_history_line_range_check
      check (line_value between -999 and 999);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'surf_market_history_books_range_check'
      and conrelid = 'public.surf_market_history'::regclass
  ) then
    alter table public.surf_market_history
      add constraint surf_market_history_books_range_check
      check (books_count between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'surf_market_history_metadata_check'
      and conrelid = 'public.surf_market_history'::regclass
  ) then
    alter table public.surf_market_history
      add constraint surf_market_history_metadata_check
      check (
        btrim(game_id) <> ''
        and btrim(game_key) <> ''
        and btrim(home_team) <> ''
        and btrim(away_team) <> ''
        and home_team <> away_team
      );
  end if;
end
$$;

create index if not exists surf_market_history_sport_commence_idx
  on public.surf_market_history (sport_key, commence_time desc);

create table if not exists public.surf_rope_audit_runs (
  id bigint generated always as identity primary key,
  sport_key text not null,
  audit_window timestamptz not null,
  audited_at timestamptz not null,
  fingerprint text not null,
  status text not null check (status in ('PASS', 'HOLD')),
  score smallint not null check (score between 0 and 100),
  game_count integer not null,
  signal_count integer not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  constraint surf_rope_audit_runs_sport_key_check
    check (sport_key in ('americanfootball_nfl_preseason', 'americanfootball_nfl', 'baseball_mlb')),
  constraint surf_rope_audit_runs_fingerprint_check
    check (fingerprint ~ '^[0-9a-f]{8}$' or fingerprint ~ '^[0-9a-f]{64}$'),
  constraint surf_rope_audit_runs_window_check
    check (audit_window <= audited_at and audited_at < audit_window + interval '15 minutes'),
  constraint surf_rope_audit_runs_report_size_check
    check (jsonb_typeof(report) = 'object' and octet_length(report::text) <= 1000000),
  constraint surf_rope_audit_runs_counts_check
    check (game_count between 0 and 1000 and signal_count between 0 and 10000),
  unique (sport_key, audit_window, fingerprint)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'surf_rope_audit_runs_sport_key_check'
      and conrelid = 'public.surf_rope_audit_runs'::regclass
  ) then
    alter table public.surf_rope_audit_runs
      add constraint surf_rope_audit_runs_sport_key_check
      check (sport_key in ('americanfootball_nfl_preseason', 'americanfootball_nfl', 'baseball_mlb'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'surf_rope_audit_runs_fingerprint_check'
      and conrelid = 'public.surf_rope_audit_runs'::regclass
  ) then
    alter table public.surf_rope_audit_runs
      add constraint surf_rope_audit_runs_fingerprint_check
      check (fingerprint ~ '^[0-9a-f]{8}$' or fingerprint ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'surf_rope_audit_runs_window_check'
      and conrelid = 'public.surf_rope_audit_runs'::regclass
  ) then
    alter table public.surf_rope_audit_runs
      add constraint surf_rope_audit_runs_window_check
      check (audit_window <= audited_at and audited_at < audit_window + interval '15 minutes');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'surf_rope_audit_runs_report_size_check'
      and conrelid = 'public.surf_rope_audit_runs'::regclass
  ) then
    alter table public.surf_rope_audit_runs
      add constraint surf_rope_audit_runs_report_size_check
      check (jsonb_typeof(report) = 'object' and octet_length(report::text) <= 1000000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'surf_rope_audit_runs_counts_check'
      and conrelid = 'public.surf_rope_audit_runs'::regclass
  ) then
    alter table public.surf_rope_audit_runs
      add constraint surf_rope_audit_runs_counts_check
      check (game_count between 0 and 1000 and signal_count between 0 and 10000);
  end if;
end
$$;

drop index if exists public.surf_rope_audit_runs_sport_audited_idx;
create index surf_rope_audit_runs_sport_audited_idx
  on public.surf_rope_audit_runs (sport_key, audited_at desc)
  include (status, score);

alter table public.surf_market_history enable row level security;
alter table public.surf_rope_audit_runs enable row level security;

revoke all on table public.surf_market_history from public, anon, authenticated, service_role;
revoke all on table public.surf_rope_audit_runs from public, anon, authenticated, service_role;
revoke all on sequence public.surf_market_history_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.surf_rope_audit_runs_id_seq from public, anon, authenticated, service_role;

grant select, insert on table public.surf_market_history to service_role;
grant select, insert on table public.surf_rope_audit_runs to service_role;
grant usage, select on sequence public.surf_market_history_id_seq to service_role;
grant usage, select on sequence public.surf_rope_audit_runs_id_seq to service_role;

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
      or v_game.sport_key not in ('americanfootball_nfl_preseason', 'americanfootball_nfl', 'baseball_mlb')
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

create or replace function public.surf_persistence_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 2,
    'market_history_ready',
      to_regclass('public.surf_market_history') is not null
      and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.surf_market_history')), false)
      and has_table_privilege(current_user, 'public.surf_market_history', 'select,insert')
      and not has_table_privilege('anon', 'public.surf_market_history', 'select')
      and not has_table_privilege('authenticated', 'public.surf_market_history', 'select')
      and has_function_privilege(current_user, 'public.record_surf_market_history(jsonb,timestamptz)', 'execute'),
    'rope_audit_ready',
      to_regclass('public.surf_rope_audit_runs') is not null
      and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.surf_rope_audit_runs')), false)
      and has_table_privilege(current_user, 'public.surf_rope_audit_runs', 'select,insert')
      and not has_table_privilege('anon', 'public.surf_rope_audit_runs', 'select')
      and not has_table_privilege('authenticated', 'public.surf_rope_audit_runs', 'select'),
    'checked_at', statement_timestamp()
  );
$$;

revoke all on function public.record_surf_market_history(jsonb, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.surf_persistence_health()
  from public, anon, authenticated, service_role;
grant execute on function public.record_surf_market_history(jsonb, timestamptz)
  to service_role;
grant execute on function public.surf_persistence_health()
  to service_role;

comment on table public.surf_market_history is
  'Private Surf sportsbook consensus history. Server-only via service_role/secret key.';
comment on table public.surf_rope_audit_runs is
  'Private ROPE release-readiness evidence. Server-only via service_role/secret key.';
comment on function public.surf_persistence_health() is
  'Server-only schema/access readiness contract for Surf persistence version 2.';

notify pgrst, 'reload schema';
