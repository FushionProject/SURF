create table if not exists public.surf_market_history (
  id bigint generated always as identity primary key,
  sport_key text not null,
  game_id text not null,
  game_key text not null,
  commence_time timestamptz not null,
  home_team text not null,
  away_team text not null,
  market text not null check (market in ('spreads', 'totals')),
  line_value numeric(8, 2) not null,
  books_count integer not null default 0 check (books_count >= 0),
  observed_at timestamptz not null,
  is_opening boolean not null default false,
  source text not null default 'the_odds_api' check (source = 'the_odds_api'),
  created_at timestamptz not null default now(),
  unique (sport_key, game_id, market, observed_at)
);

create index if not exists surf_market_history_game_market_observed_idx
  on public.surf_market_history (sport_key, game_id, market, observed_at asc);

alter table public.surf_market_history enable row level security;

-- Surf's market history is server-only. Browser roles receive neither table
-- privileges nor RLS policies, while the server secret uses service_role.
revoke all on table public.surf_market_history from public, anon, authenticated;
grant select, insert on table public.surf_market_history to service_role;
grant usage, select on sequence public.surf_market_history_id_seq to service_role;

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
  v_has_previous boolean;
  v_inserted integer := 0;
begin
  if jsonb_typeof(p_games) is distinct from 'array' then
    raise exception 'p_games must be a JSON array';
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
  loop
    if v_game.sport_key is null
      or v_game.game_id is null
      or v_game.game_key is null
      or v_game.commence_time is null
      or v_game.home_team is null
      or v_game.away_team is null then
      raise exception 'market history game metadata is incomplete';
    end if;

    if v_game.spread_value is not null then
      perform pg_advisory_xact_lock(
        hashtextextended(v_game.sport_key || ':' || v_game.game_id || ':spreads', 0)
      );

      select history.line_value
        into v_previous
      from public.surf_market_history as history
      where history.sport_key = v_game.sport_key
        and history.game_id = v_game.game_id
        and history.market = 'spreads'
      order by history.observed_at desc, history.id desc
      limit 1;

      v_has_previous := found;

      if not v_has_previous or abs(v_previous - v_game.spread_value) >= 0.25 then
        insert into public.surf_market_history (
          sport_key,
          game_id,
          game_key,
          commence_time,
          home_team,
          away_team,
          market,
          line_value,
          books_count,
          observed_at,
          is_opening
        )
        values (
          v_game.sport_key,
          v_game.game_id,
          v_game.game_key,
          v_game.commence_time,
          v_game.home_team,
          v_game.away_team,
          'spreads',
          v_game.spread_value,
          greatest(coalesce(v_game.spread_books, 0), 0),
          p_observed_at,
          not v_has_previous
        );
        v_inserted := v_inserted + 1;
      end if;
    end if;

    if v_game.total_value is not null then
      perform pg_advisory_xact_lock(
        hashtextextended(v_game.sport_key || ':' || v_game.game_id || ':totals', 0)
      );

      select history.line_value
        into v_previous
      from public.surf_market_history as history
      where history.sport_key = v_game.sport_key
        and history.game_id = v_game.game_id
        and history.market = 'totals'
      order by history.observed_at desc, history.id desc
      limit 1;

      v_has_previous := found;

      if not v_has_previous or abs(v_previous - v_game.total_value) >= 0.25 then
        insert into public.surf_market_history (
          sport_key,
          game_id,
          game_key,
          commence_time,
          home_team,
          away_team,
          market,
          line_value,
          books_count,
          observed_at,
          is_opening
        )
        values (
          v_game.sport_key,
          v_game.game_id,
          v_game.game_key,
          v_game.commence_time,
          v_game.home_team,
          v_game.away_team,
          'totals',
          v_game.total_value,
          greatest(coalesce(v_game.total_books, 0), 0),
          p_observed_at,
          not v_has_previous
        );
        v_inserted := v_inserted + 1;
      end if;
    end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.record_surf_market_history(jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_surf_market_history(jsonb, timestamptz)
  to service_role;
