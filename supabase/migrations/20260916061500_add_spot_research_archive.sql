-- Durable server-only home for the private nflverse research archive.
--
-- The archive is stored as the exact canonical JSON body the importer built,
-- not as decomposed columns: every read re-hashes that body and re-runs the
-- same validation the local file store uses, so a row that was altered in the
-- database fails the fingerprint check instead of being served. Decomposing it
-- would reorder JSON keys and break that contract.
--
-- Browser roles receive neither table privileges nor RLS policies. Publication
-- rights for this source remain unconfirmed; storage is not clearance.

create table if not exists public.surf_spot_research_archives (
  id bigint generated always as identity primary key,
  provider text not null default 'nflverse' check (provider = 'nflverse'),
  access text not null default 'research' check (access = 'research'),
  schema_version integer not null check (schema_version = 1),
  source_url text not null check (source_url like 'https://%'),
  retrieved_at timestamptz not null,
  csv_sha256 text not null check (csv_sha256 ~ '^[a-f0-9]{64}$'),
  license_sha256 text not null check (license_sha256 ~ '^[a-f0-9]{64}$'),
  archive_sha256 text not null unique check (archive_sha256 ~ '^[a-f0-9]{64}$'),
  attribution jsonb not null,
  archive_json text not null check (octet_length(archive_json) between 1 and 17039360),
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

-- At most one archive is ever the selected one.
create unique index if not exists surf_spot_research_current_idx
  on public.surf_spot_research_archives (is_current) where is_current;

create index if not exists surf_spot_research_retrieved_idx
  on public.surf_spot_research_archives (retrieved_at desc);

alter table public.surf_spot_research_archives enable row level security;

revoke all on table public.surf_spot_research_archives from public, anon, authenticated;
grant select, insert, update on table public.surf_spot_research_archives to service_role;
grant usage, select on sequence public.surf_spot_research_archives_id_seq to service_role;

-- Importing the same archive twice selects the existing row rather than
-- creating a second copy of an 8 MB body.
create or replace function public.record_surf_spot_research(
  p_schema_version integer,
  p_source_url text,
  p_retrieved_at timestamptz,
  p_csv_sha256 text,
  p_license_sha256 text,
  p_archive_sha256 text,
  p_attribution jsonb,
  p_archive_json text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_schema_version is distinct from 1 then
    raise exception 'unsupported research schema version';
  end if;
  if p_archive_sha256 is null or p_archive_sha256 !~ '^[a-f0-9]{64}$'
    or p_csv_sha256 is null or p_csv_sha256 !~ '^[a-f0-9]{64}$'
    or p_license_sha256 is null or p_license_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid research fingerprint';
  end if;
  if jsonb_typeof(p_attribution) is distinct from 'object' then
    raise exception 'attribution must be a JSON object';
  end if;
  if p_retrieved_at is null or p_retrieved_at > now() + interval '1 hour' then
    raise exception 'invalid research retrieval time';
  end if;

  -- One importer at a time; the pointer flip below must not interleave.
  perform pg_advisory_xact_lock(hashtextextended('surf_spot_research', 0));

  insert into public.surf_spot_research_archives as archives (
    schema_version, source_url, retrieved_at, csv_sha256, license_sha256,
    archive_sha256, attribution, archive_json, is_current
  )
  values (
    p_schema_version, p_source_url, p_retrieved_at, p_csv_sha256, p_license_sha256,
    p_archive_sha256, p_attribution, p_archive_json, false
  )
  on conflict (archive_sha256) do update
    set retrieved_at = excluded.retrieved_at
  returning archives.id into v_id;

  update public.surf_spot_research_archives
    set is_current = false
    where is_current and id <> v_id;
  update public.surf_spot_research_archives
    set is_current = true
    where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.record_surf_spot_research(integer, text, timestamptz, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_surf_spot_research(integer, text, timestamptz, text, text, text, jsonb, text)
  to service_role;

-- Cheap readiness probe. Readers compare archive_sha256 against their cached
-- copy so an unchanged archive is never re-downloaded.
create or replace function public.surf_spot_research_health()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'has_current', exists (select 1 from public.surf_spot_research_archives where is_current),
    'archive_sha256', (select archive_sha256 from public.surf_spot_research_archives where is_current),
    'retrieved_at', (select retrieved_at from public.surf_spot_research_archives where is_current),
    'archive_bytes', (select octet_length(archive_json) from public.surf_spot_research_archives where is_current),
    'archives', (select count(*) from public.surf_spot_research_archives)
  );
$$;

revoke all on function public.surf_spot_research_health() from public, anon, authenticated;
grant execute on function public.surf_spot_research_health() to service_role;
