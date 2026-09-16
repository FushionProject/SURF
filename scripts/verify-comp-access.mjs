import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compAccessEmails, hasCompAccess } from "../lib/billing/comp-access.ts";

// Deny by default: nothing configured grants nothing.
assert.equal(hasCompAccess("owner@example.com", {}), false);
assert.equal(hasCompAccess("owner@example.com", { SURF_COMP_ACCESS_EMAILS: "" }), false);
assert.equal(hasCompAccess("owner@example.com", { SURF_COMP_ACCESS_EMAILS: "   " }), false);
assert.equal(compAccessEmails({}).size, 0);

// Explicit listing grants, case and whitespace insensitive.
const env = { SURF_COMP_ACCESS_EMAILS: " Owner@Example.com , second@example.com " };
assert.equal(hasCompAccess("owner@example.com", env), true);
assert.equal(hasCompAccess("OWNER@EXAMPLE.COM", env), true);
assert.equal(hasCompAccess("second@example.com", env), true);
assert.equal(compAccessEmails(env).size, 2);

// Everyone else stays denied; malformed values never match.
assert.equal(hasCompAccess("stranger@example.com", env), false);
assert.equal(hasCompAccess("", env), false);
assert.equal(hasCompAccess(null, env), false);
assert.equal(hasCompAccess(undefined, env), false);
assert.equal(hasCompAccess("owner", { SURF_COMP_ACCESS_EMAILS: "owner" }), false);

// A list of junk without an address grants nothing.
assert.equal(compAccessEmails({ SURF_COMP_ACCESS_EMAILS: "yes,true,*" }).size, 0);

// Static contract: comp access is checked only after a confirmed signed-in
// user is resolved, and before any Stripe runtime is constructed.
const access = await readFile(new URL("../lib/billing/access.ts", import.meta.url), "utf8");
assert.ok(access.indexOf("billingUser()") < access.indexOf("hasCompAccess(user.email)"));
assert.ok(access.indexOf("hasCompAccess(user.email)") < access.indexOf("billingRuntime()"));
assert.ok(access.indexOf("paidAccessRequired()") < access.indexOf("billingUser()"));

console.log("Comp access passed: deny by default, explicit allowlist only, checked after confirmed sign-in and before Stripe.");
