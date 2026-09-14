import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const userId = "00000000-0000-4000-8000-000000000001";
try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);");
  await db.query("insert into auth.users values ($1)", [userId]);
  await db.exec(await readFile("supabase/migrations/20260907212045_add_surf_billing.sql", "utf8"));
  await db.exec("set role service_role");
  await db.query("insert into public.surf_billing_customers (user_id,livemode,stripe_customer_id) values ($1,false,'cus_fixture')", [userId]);
  const prepare = (nonce = null) => db.query("select * from public.surf_prepare_billing_checkout($1,false,$2)", [userId, nonce]);
  const first = (await prepare()).rows[0];
  assert.equal((await prepare()).rows[0].checkout_nonce, first.checkout_nonce);
  const rotated = (await prepare(first.checkout_nonce)).rows[0];
  assert.notEqual(rotated.checkout_nonce, first.checkout_nonce);
  assert.equal((await prepare(first.checkout_nonce)).rows[0].checkout_nonce, rotated.checkout_nonce, "a concurrent stale rotate cannot reset a new checkout");
  await assert.rejects(db.query("insert into public.surf_billing_customers (user_id,livemode,stripe_customer_id) values ($1,false,'cus_other')", [userId]));
  await db.query("insert into public.surf_billing_customers (user_id,livemode,stripe_customer_id) values ($1,true,'cus_livefixture')", [userId]);
  const event = (id, status, observed, customer = "cus_fixture") => db.query("select public.surf_record_billing_event($1,false,'customer.subscription.updated',now(),'sub_fixture',$2,'price_fixture',$3,null,null,$4)", [id, customer, status, observed]);
  await event("evt_new", "active", "2026-09-01T00:00:01Z");
  await event("evt_old", "past_due", "2026-09-01T00:00:00Z");
  assert.equal((await db.query("select status from public.surf_billing_subscriptions")).rows[0].status, "active", "older in-flight reads cannot overwrite newer observations");
  await event("evt_new", "canceled", "2026-09-01T00:00:03Z");
  assert.equal((await db.query("select status from public.surf_billing_subscriptions")).rows[0].status, "active", "duplicate events cannot apply twice");
  await event("evt_cancel", "canceled", "2026-09-01T00:00:02Z");
  assert.equal((await db.query("select status from public.surf_billing_subscriptions")).rows[0].status, "canceled");
  await assert.rejects(event("evt_badstatus", "paid_forever", "2026-09-01T00:00:04Z"));
  assert.equal((await db.query("select count(*)::int as n from public.surf_billing_events where stripe_event_id='evt_badstatus'")).rows[0].n, 0, "failed reconciliation rolls the journal insert back for retry");
  await assert.rejects(db.query("delete from public.surf_billing_events"), "service cannot erase billing audit history");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role}`);
    for (const table of ["surf_billing_customers", "surf_billing_subscriptions", "surf_billing_events"]) {
      for (const sql of [`select * from public.${table}`, `delete from public.${table}`, `insert into public.${table} default values`]) await assert.rejects(db.query(sql), `${role} is denied ${sql}`);
    }
    await assert.rejects(prepare());
    await assert.rejects(event("evt_forged", "active", "2026-09-01T00:00:05Z"));
  }
  await db.exec("reset role");
  const rls = await db.query("select relrowsecurity from pg_class where relname in ('surf_billing_customers','surf_billing_subscriptions','surf_billing_events')");
  assert.ok(rls.rows.every((row) => row.relrowsecurity));
  console.log("Billing PostgreSQL passed: private RLS/grants, test/live isolation, durable checkout nonce CAS, atomic event deduplication, out-of-order defense, invalid-state rollback, and browser-role denial. Local database only.");
} finally { await db.close(); }
