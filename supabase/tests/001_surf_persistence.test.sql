begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

select has_table('public', 'surf_market_history', 'market history table exists');
select has_table('public', 'surf_rope_audit_runs', 'ROPE audit table exists');
select results_eq(
  $$select to_regprocedure('public.record_surf_market_history(jsonb,timestamp with time zone)') is not null$$,
  array[true],
  'market-history recorder exists with the expected signature'
);
select results_eq(
  $$select to_regprocedure('public.surf_persistence_health()') is not null$$,
  array[true],
  'persistence health function exists'
);

select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.surf_market_history'::regclass$$,
  array[true],
  'market history has RLS enabled'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.surf_rope_audit_runs'::regclass$$,
  array[true],
  'ROPE audit history has RLS enabled'
);
select results_eq($$select has_table_privilege('anon', 'public.surf_market_history', 'select')$$, array[false], 'anon cannot read market history');
select results_eq($$select has_table_privilege('authenticated', 'public.surf_market_history', 'select')$$, array[false], 'authenticated users cannot read market history');
select results_eq($$select has_table_privilege('anon', 'public.surf_rope_audit_runs', 'select')$$, array[false], 'anon cannot read ROPE evidence');
select results_eq($$select has_table_privilege('authenticated', 'public.surf_rope_audit_runs', 'select')$$, array[false], 'authenticated users cannot read ROPE evidence');
select results_eq($$select has_function_privilege('anon', 'public.record_surf_market_history(jsonb,timestamp with time zone)', 'execute')$$, array[false], 'anon cannot execute the recorder');
select results_eq($$select has_function_privilege('authenticated', 'public.record_surf_market_history(jsonb,timestamp with time zone)', 'execute')$$, array[false], 'authenticated users cannot execute the recorder');
select results_eq($$select has_function_privilege('anon', 'public.surf_persistence_health()', 'execute')$$, array[false], 'anon cannot execute the health contract');
select results_eq($$select has_function_privilege('authenticated', 'public.surf_persistence_health()', 'execute')$$, array[false], 'authenticated users cannot execute the health contract');
select results_eq(
  $$select has_table_privilege('service_role', 'public.surf_market_history', 'select,insert')$$,
  array[true],
  'service role has exact market-history data privileges'
);
select results_eq(
  $$select has_table_privilege('service_role', 'public.surf_rope_audit_runs', 'select,insert')$$,
  array[true],
  'service role has exact ROPE data privileges'
);

select lives_ok(
  $$
    select public.record_surf_market_history(
      jsonb_build_array(jsonb_build_object(
        'sport_key', 'americanfootball_nfl',
        'game_id', 'rope-db-game',
        'game_key', 'americanfootball_nfl:BUF:HOU:2026-09-10T17:00:00Z',
        'commence_time', '2026-09-10T17:00:00Z',
        'home_team', 'Houston Texans',
        'away_team', 'Buffalo Bills',
        'spread_value', -2.5,
        'spread_books', 9,
        'total_value', 44.5,
        'total_books', 9
      )),
      clock_timestamp() - interval '10 minutes'
    )
  $$,
  'a complete snapshot is accepted'
);
select results_eq(
  $$select count(*)::integer from public.surf_market_history where game_id = 'rope-db-game'$$,
  array[2],
  'opening spread and total are stored'
);
select results_eq(
  $$
    select public.record_surf_market_history(
      jsonb_build_array(jsonb_build_object(
        'sport_key', 'americanfootball_nfl', 'game_id', 'rope-db-game',
        'game_key', 'americanfootball_nfl:BUF:HOU:2026-09-10T17:00:00Z',
        'commence_time', '2026-09-10T17:00:00Z', 'home_team', 'Houston Texans',
        'away_team', 'Buffalo Bills', 'spread_value', -2.5, 'spread_books', 9,
        'total_value', 44.5, 'total_books', 9
      )), clock_timestamp() - interval '9 minutes'
    )
  $$,
  array[0],
  'an unchanged retry is idempotent'
);
select results_eq(
  $$
    select public.record_surf_market_history(
      jsonb_build_array(jsonb_build_object(
        'sport_key', 'americanfootball_nfl', 'game_id', 'rope-db-game',
        'game_key', 'americanfootball_nfl:BUF:HOU:2026-09-10T17:00:00Z',
        'commence_time', '2026-09-10T17:00:00Z', 'home_team', 'Houston Texans',
        'away_team', 'Buffalo Bills', 'spread_value', -2.4, 'spread_books', 9,
        'total_value', 44.6, 'total_books', 9
      )), clock_timestamp() - interval '8 minutes'
    )
  $$,
  array[0],
  'sub-threshold noise is rejected'
);
select results_eq(
  $$
    select public.record_surf_market_history(
      jsonb_build_array(jsonb_build_object(
        'sport_key', 'americanfootball_nfl', 'game_id', 'rope-db-game',
        'game_key', 'americanfootball_nfl:BUF:HOU:2026-09-10T17:00:00Z',
        'commence_time', '2026-09-10T17:00:00Z', 'home_team', 'Houston Texans',
        'away_team', 'Buffalo Bills', 'spread_value', -3.0, 'spread_books', 9,
        'total_value', 45.0, 'total_books', 9
      )), clock_timestamp() - interval '7 minutes'
    )
  $$,
  array[2],
  'meaningful spread and total changes are stored'
);
select results_eq(
  $$select count(*)::integer from public.surf_market_history where game_id = 'rope-db-game'$$,
  array[4],
  'the full two-market timeline is retained'
);
select results_eq(
  $$select count(*)::integer from public.surf_market_history where game_id = 'rope-db-game' and is_opening$$,
  array[2],
  'exactly one opener exists per market'
);
select results_eq(
  $$
    select public.record_surf_market_history(
      jsonb_build_array(jsonb_build_object(
        'sport_key', 'americanfootball_nfl', 'game_id', 'rope-db-game',
        'game_key', 'americanfootball_nfl:BUF:HOU:2026-09-10T17:00:00Z',
        'commence_time', '2026-09-10T17:00:00Z', 'home_team', 'Houston Texans',
        'away_team', 'Buffalo Bills', 'spread_value', -4.0, 'spread_books', 9,
        'total_value', 46.0, 'total_books', 9
      )), clock_timestamp() - interval '8 minutes'
    )
  $$,
  array[0],
  'a late stale write cannot invert the timeline'
);
select throws_ok(
  $$select public.record_surf_market_history('[]'::jsonb, clock_timestamp() + interval '6 minutes')$$,
  '22023',
  'p_observed_at is too far in the future',
  'future clock skew is rejected'
);
select throws_ok(
  $$
    select public.record_surf_market_history(
      '[{"sport_key":"americanfootball_nfl","game_id":"","game_key":"bad","commence_time":"2026-09-10T17:00:00Z","home_team":"Same","away_team":"Same"}]'::jsonb,
      clock_timestamp()
    )
  $$,
  '22023',
  'market history game metadata is invalid',
  'blank ids and identical teams are rejected'
);
select throws_ok(
  $$select public.record_surf_market_history((select jsonb_agg(jsonb_build_object('sport_key', 'americanfootball_nfl', 'game_id', value::text)) from generate_series(1, 65) value), clock_timestamp())$$,
  '22023',
  'p_games exceeds the 64-game batch limit',
  'oversized batches are rejected'
);
select throws_ok(
  $$
    select public.record_surf_market_history(
      '[{"sport_key":"americanfootball_nfl","game_id":"duplicate"},{"sport_key":"americanfootball_nfl","game_id":"duplicate"}]'::jsonb,
      clock_timestamp()
    )
  $$,
  '22023',
  'p_games contains duplicate game ids',
  'ambiguous duplicate games are rejected before writes'
);

select results_eq(
  $$select (public.surf_persistence_health()->>'schema_version')::integer$$,
  array[2],
  'health contract reports schema version 2'
);
select results_eq(
  $$select (public.surf_persistence_health()->>'market_history_ready')::boolean$$,
  array[true],
  'health contract verifies market-history security and grants'
);
select results_eq(
  $$select (public.surf_persistence_health()->>'rope_audit_ready')::boolean$$,
  array[true],
  'health contract verifies ROPE security and grants'
);

select lives_ok(
  $$
    with audit_time as (
      select clock_timestamp() as audited_at
    )
    insert into public.surf_rope_audit_runs (
      sport_key, audit_window, audited_at, fingerprint, status, score,
      game_count, signal_count, report
    )
    select
      'americanfootball_nfl',
      to_timestamp(floor(extract(epoch from audited_at) / 900) * 900),
      audited_at,
      repeat('a', 64),
      'PASS',
      100,
      16,
      4,
      '{"acronym":"ROPE","status":"PASS"}'::jsonb
    from audit_time
  $$,
  'valid ROPE evidence is retained'
);
select results_eq(
  $$select count(*)::integer from public.surf_rope_audit_runs where fingerprint = repeat('a', 64)$$,
  array[1],
  'ROPE persistence writes exactly one report'
);

select * from finish();
rollback;
