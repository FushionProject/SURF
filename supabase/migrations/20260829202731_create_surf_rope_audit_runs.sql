create table if not exists public.surf_rope_audit_runs (
  id bigint generated always as identity primary key,
  sport_key text not null,
  audit_window timestamptz not null,
  audited_at timestamptz not null,
  fingerprint text not null,
  status text not null check (status in ('PASS', 'HOLD')),
  score smallint not null check (score between 0 and 100),
  game_count integer not null check (game_count >= 0),
  signal_count integer not null check (signal_count >= 0),
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now(),
  unique (sport_key, audit_window, fingerprint)
);

create index if not exists surf_rope_audit_runs_sport_audited_idx
  on public.surf_rope_audit_runs (sport_key, audited_at desc);

alter table public.surf_rope_audit_runs enable row level security;

-- ROPE evidence contains private provider/account telemetry. Only server-side
-- clients holding a Supabase secret/service-role key may use the table.
revoke all on table public.surf_rope_audit_runs from public, anon, authenticated;
revoke all on sequence public.surf_rope_audit_runs_id_seq from public, anon, authenticated;
grant select, insert, update on table public.surf_rope_audit_runs to service_role;
grant usage, select on sequence public.surf_rope_audit_runs_id_seq to service_role;

comment on table public.surf_rope_audit_runs is
  'Private ROPE (Release of Perfection Examination) release-readiness reports.';
