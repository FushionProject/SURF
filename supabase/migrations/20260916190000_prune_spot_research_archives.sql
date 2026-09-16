-- Daily refreshes create a new archive body each time, because the retrieval
-- time is part of the archive and therefore part of its fingerprint. Without
-- retention that is roughly 2 MB per day forever. Keep the selected archive and
-- the two most recent superseded ones, so an older report can still be traced
-- without the table growing without bound.

grant delete on table public.surf_spot_research_archives to service_role;

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

  -- The selected archive is never a deletion candidate.
  delete from public.surf_spot_research_archives
  where id in (
    select id
    from public.surf_spot_research_archives
    where not is_current
    order by created_at desc, id desc
    offset 2
  );

  return v_id;
end;
$$;

revoke all on function public.record_surf_spot_research(integer, text, timestamptz, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_surf_spot_research(integer, text, timestamptz, text, text, text, jsonb, text)
  to service_role;
