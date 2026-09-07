import assert from "node:assert/strict";
import { safeNextPath } from "../lib/supabase/safeNextPath.ts";
import { resolveAuthOrigin, readCredentials, friendlyAuthError, isEmailConfirmationType } from "../lib/supabase/authSupport.ts";
import { getSupabasePublicConfig } from "../lib/supabase/config.ts";
for (const input of [null, "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "javascript:alert(1)"]) {
  assert.equal(safeNextPath(input), "/account", JSON.stringify(input));
}
for (const input of ["/account", "/games?sport=baseball_mlb#market-board", "/feed", "/%2Fexample"]) {
  const output = safeNextPath(input);
  assert.equal(new URL(output, "https://surf.invalid").origin, "https://surf.invalid");
  assert.equal(output, input);
}
console.log("Auth redirect fixtures passed: external, backslash and control-character destinations rejected; internal routes preserved.");

const preview = { configured: "http://localhost:3000", requestOrigin: "http://10.0.0.28:3158", requestHost: "10.0.0.28:3158", development: true };
assert.equal(resolveAuthOrigin(preview), "http://10.0.0.28:3158");
assert.equal(resolveAuthOrigin({ ...preview, development: false }), "http://10.0.0.28:3158");
assert.equal(resolveAuthOrigin({ ...preview, requestOrigin: "http://localhost:3158", requestHost: "localhost:3158" }), "http://localhost:3158");
assert.equal(resolveAuthOrigin({ ...preview, requestOrigin: "http://[::1]:3158", requestHost: "[::1]:3158" }), "http://[::1]:3158");
assert.equal(resolveAuthOrigin({ ...preview, requestHost: "localhost:3158" }), "http://localhost:3000");
for (const requestOrigin of ["https://evil.example", "http://172.32.0.1:3158", "http://10.0.0.28:3158/steal", "http://user:secret@10.0.0.28:3158", "http://10.0.0.28:3158?redirect=evil"]) {
  assert.equal(resolveAuthOrigin({ ...preview, requestOrigin }), "http://localhost:3000");
}
assert.equal(resolveAuthOrigin({ ...preview, configured: "https://surf.example", development: false }), "https://surf.example");
assert.equal(resolveAuthOrigin({ ...preview, configured: "https://surf.example" }), "https://surf.example");
assert.equal(resolveAuthOrigin({ ...preview, configured: undefined, development: false }), undefined);
assert.equal(resolveAuthOrigin({ ...preview, configured: "javascript:alert(1)", development: false }), undefined);
assert.equal(resolveAuthOrigin({ ...preview, configured: "https://surf.example/path", development: false }), undefined);
assert.equal(resolveAuthOrigin({ ...preview, configured: "http://insecure.example", development: false }), undefined);

function credentials(email, password) {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  return form;
}
assert.deepEqual(readCredentials(credentials(" Alice@Example.com ", "eight888"), "create"), { email: "alice@example.com", password: "eight888" });
assert.equal(readCredentials(credentials("a@example.com", "older6"), "sign-in").password, "older6");
assert.ok(readCredentials(credentials("a@example.com", "older6"), "create").error);
for (const email of ["", "a@", "@example.com", "a b@example.com", "a@@example.com", "x".repeat(255) + "@example.com"]) {
  assert.ok(readCredentials(credentials(email, "eight888"), "create").error);
}
assert.ok(readCredentials(credentials("a@example.com", ""), "sign-in").error);
assert.ok(readCredentials(credentials("a@example.com", "x".repeat(129)), "sign-in").error);
assert.equal(friendlyAuthError("Email not confirmed"), "Confirm your email before signing in.");
assert.equal(friendlyAuthError("unexpected secret=never-echo-provider-data"), "Surf could not complete that account request. Try again.");
assert.equal(isEmailConfirmationType("signup"), true);
assert.equal(isEmailConfirmationType("email"), true);
assert.equal(isEmailConfirmationType("sms"), false);
assert.equal(isEmailConfirmationType(null), false);

const previous = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
try {
  process.env.NEXT_PUBLIC_SUPABASE_URL = " https://surf.example/ ";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
  assert.equal(getSupabasePublicConfig()?.url, "https://surf.example");
  for (const key of ["sb_secret_do-not-expose", "bad-value", `header.${Buffer.from(JSON.stringify({role:"service_role"})).toString("base64url")}.signature`]) {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
    assert.equal(getSupabasePublicConfig(), undefined);
  }
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = `header.${Buffer.from(JSON.stringify({role:"anon"})).toString("base64url")}.signature`;
  assert.ok(getSupabasePublicConfig());
  for (const url of ["not-url", "http://insecure.example", "https://user:pass@surf.example", "https://surf.example/path", "https://surf.example?q=x"]) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    assert.equal(getSupabasePublicConfig(), undefined);
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  assert.ok(getSupabasePublicConfig());
} finally {
  if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
  if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previous.key;
}
console.log("Account boundary fixtures passed: local preview origins, production origin lock, credential validation, OTP allowlist and public-key safety.");
