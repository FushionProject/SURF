import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
// Re-applying the newest migration must stay idempotent.
await db.exec(readFileSync('supabase/migrations/20260916061500_add_spot_research_archive.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20260916190000_prune_spot_research_archives.sql', 'utf8'));
await db.exec('set role service_role');

const sha = (text) => createHash('sha256').update(text).digest('hex');
const attribution = JSON.stringify({ license: 'CC-BY-4.0', publicationRights: 'unconfirmed' });
const record = (body, retrievedAt = '2026-09-08T18:00:00Z', overrides = {}) => db.query(
  'select public.record_surf_spot_research($1::integer,$2::text,$3::timestamptz,$4::text,$5::text,$6::text,$7::jsonb,$8::text) as id',
  [overrides.version ?? 1, overrides.url ?? 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',
   retrievedAt, overrides.csv ?? sha('csv'), overrides.license ?? sha('license'), overrides.archive ?? sha(body), attribution, body]);

let health = (await db.query('select public.surf_spot_research_health() as h')).rows[0].h;
assert.equal(health.has_current, false);
assert.equal(health.archives, 0);
assert.equal(health.schema_version, 1);

await record('{"schemaVersion":1,"body":"first"}');
health = (await db.query('select public.surf_spot_research_health() as h')).rows[0].h;
assert.equal(health.has_current, true);
assert.equal(health.archives, 1);
assert.equal(health.archive_sha256, sha('{"schemaVersion":1,"body":"first"}'));

// Re-importing the identical archive selects the existing row, not a second copy.
await record('{"schemaVersion":1,"body":"first"}', '2026-09-09T18:00:00Z');
health = (await db.query('select public.surf_spot_research_health() as h')).rows[0].h;
assert.equal(health.archives, 1);
assert.equal(new Date(health.retrieved_at).toISOString(), '2026-09-09T18:00:00.000Z');

// A new archive becomes the only selected one; the previous body is retained.
await record('{"schemaVersion":1,"body":"second"}');
health = (await db.query('select public.surf_spot_research_health() as h')).rows[0].h;
assert.equal(health.archives, 2);
assert.equal(health.archive_sha256, sha('{"schemaVersion":1,"body":"second"}'));
assert.equal((await db.query('select count(*)::int as n from public.surf_spot_research_archives where is_current')).rows[0].n, 1);

// Bad provenance is refused rather than stored.
await assert.rejects(record('{"body":"x"}', '2026-09-08T18:00:00Z', { version: 2 }));
await assert.rejects(record('{"body":"x"}', '2026-09-08T18:00:00Z', { archive: 'not-a-digest' }));
await assert.rejects(record('{"body":"x"}', '2026-09-08T18:00:00Z', { csv: 'short' }));
await assert.rejects(record('{"body":"x"}', '2999-01-01T00:00:00Z'));
await assert.rejects(db.query("insert into public.surf_spot_research_archives (schema_version,source_url,retrieved_at,csv_sha256,license_sha256,archive_sha256,attribution,archive_json) values (1,'http://insecure.example',now(),$1,$1,$1,'{}'::jsonb,'{}')", [sha('x')]));
await assert.rejects(db.query("insert into public.surf_spot_research_archives (provider,schema_version,source_url,retrieved_at,csv_sha256,license_sha256,archive_sha256,attribution,archive_json) values ('sportsdataio',1,'https://example.com',now(),$1,$1,$1,'{}'::jsonb,'{}')", [sha('y')]));

// Two selected archives can never coexist.
await assert.rejects(db.query('update public.surf_spot_research_archives set is_current = true'));

// Retention: the selected archive plus the two most recent superseded ones.
for (const n of [3, 4, 5, 6]) await record('{"schemaVersion":1,"body":"gen' + n + '"}');
const kept = await db.query('select archive_json, is_current from public.surf_spot_research_archives order by created_at desc, id desc');
assert.equal(kept.rows.length, 3, 'older superseded archives are pruned');
assert.equal(kept.rows.filter(r => r.is_current).length, 1);
assert.equal(kept.rows.find(r => r.is_current).archive_json, '{"schemaVersion":1,"body":"gen6"}');
assert.ok(kept.rows.every(r => r.archive_json !== '{"schemaVersion":1,"body":"first"}'), 'the oldest body is gone');

await db.exec('reset role; set role anon');
await assert.rejects(db.query('select * from public.surf_spot_research_archives'));
await assert.rejects(db.query('select public.surf_spot_research_health()'));
await assert.rejects(db.query("select public.record_surf_spot_research(1,'https://example.com',now(),$1,$1,$1,'{}'::jsonb,'{}')", [sha('z')]));

console.log('Spot research PostgreSQL passed: migrations idempotent, single selected archive, idempotent re-import, provenance constraints enforced, retention keeps three archives, anonymous access denied.');
await db.close();
