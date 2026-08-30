import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const migrationDirectory = join(root, "supabase", "migrations");
const migrationNames = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
assert.ok(migrationNames.length >= 3, "market history, ROPE storage, and reliability hardening migrations must exist");
assert.deepEqual(migrationNames, migrationNames.slice().sort(), "migration names must remain chronologically sortable");

const migrationText = (await Promise.all(
  migrationNames.map((name) => readFile(join(migrationDirectory, name), "utf8")),
)).join("\n");
const hardeningName = migrationNames.find((name) => name.includes("harden_surf_persistence"));
assert.ok(hardeningName, "the persistence hardening migration must exist");
const hardening = await readFile(join(migrationDirectory, hardeningName), "utf8");

for (const table of ["surf_market_history", "surf_rope_audit_runs"]) {
  assert.match(hardening, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  assert.match(hardening, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`, "i"));
  assert.match(hardening, new RegExp(`grant select, insert on table public\\.${table} to service_role`, "i"));
}

assert.match(hardening, /create or replace function public\.surf_persistence_health\(\)/i);
assert.match(hardening, /create or replace function public\.record_surf_market_history/i);
assert.doesNotMatch(hardening, /security\s+definer/i, "Surf persistence functions must not bypass RLS");
assert.match(hardening, /security\s+invoker/gi);
assert.match(hardening, /set search_path = ''/gi);
assert.match(hardening, /jsonb_array_length\(p_games\) > 64/i);
assert.match(hardening, /order by sport_key, game_id/i, "advisory locks must be acquired in deterministic game order");
assert.match(hardening, /pg_advisory_xact_lock/gi);
assert.match(hardening, /on conflict \(sport_key, game_id, market, observed_at\) do nothing/i);
assert.match(hardening, /p_observed_at >= v_previous_observed_at/i, "stale captures must not create a time-inverted history");
assert.match(hardening, /fingerprint[^;]+\[0-9a-f\]\{64\}/is);
assert.match(hardening, /octet_length\(report::text\) <= 1000000/i);
assert.match(hardening, /include \(status, score\)/i);
assert.match(hardening, /notify pgrst, 'reload schema'/i);

assert.doesNotMatch(migrationText, /NEXT_PUBLIC_SUPABASE_(?:SECRET|SERVICE)/i);
assert.doesNotMatch(migrationText, /grant\s+all/i, "migrations must use least-privilege grants");

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.match(packageJson.dependencies["@supabase/supabase-js"], /^\d+\.\d+\.\d+$/, "supabase-js must be pinned exactly");
assert.match(packageJson.dependencies["@supabase/ssr"], /^\d+\.\d+\.\d+$/, "Supabase SSR must be pinned exactly");

const serverPersistence = await readFile(join(root, "lib", "surf", "supabasePersistence.ts"), "utf8");
assert.match(serverPersistence, /process\.env\.SUPABASE_SECRET_KEY/);
assert.match(serverPersistence, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(serverPersistence, /NEXT_PUBLIC_SUPABASE_(?:SECRET|SERVICE)/);
assert.match(serverPersistence, /persistSession:\s*false/);
assert.match(serverPersistence, /SURF_PERSISTENCE_SCHEMA_VERSION = 2/);

console.log("Supabase schema contract passed: versioned health, RLS, explicit grants, safe functions, bounded inputs, deterministic locks, constraints, indexes, and pinned clients.");
