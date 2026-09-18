import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TERMS_BODY } from "../lib/legal/terms.ts";
import { PRIVACY_BODY } from "../lib/legal/privacy.ts";
import { METHODOLOGY_BODY } from "../lib/legal/methodology.ts";
import { LEGAL_CONTACT, LEGAL_MIN_AGE } from "../lib/legal/shared.ts";

const docs = { terms: TERMS_BODY, privacy: PRIVACY_BODY, methodology: METHODOLOGY_BODY };

for (const [name, body] of Object.entries(docs)) {
  // Nothing may ship with an unfilled blank.
  assert.doesNotMatch(body, /\[\[PLACEHOLDER/, `${name} still contains a placeholder`);
  assert.doesNotMatch(body, /TODO|TBD|XXX|lorem ipsum/i, `${name} contains filler`);
  // Every document must be reachable for help or a rights complaint.
  assert.ok(body.includes(LEGAL_CONTACT), `${name} is missing the contact address`);
  // Stale helpline numbers are worse than none on a betting-adjacent site.
  assert.doesNotMatch(body, /1-800-GAMBLER/, `${name} uses the retired helpline number`);
}

// The helpline that is published must be the current one.
for (const name of ["terms", "methodology"]) {
  assert.match(docs[name], /1-800-MY-RESET/, `${name} must carry the current helpline`);
  assert.match(docs[name], /1800myreset\.org/);
}

// Age floor and territory are stated consistently and match the configured value.
assert.equal(LEGAL_MIN_AGE, 18);
assert.match(TERMS_BODY, /at least 18/);
assert.match(PRIVACY_BODY, /at least 18/);
assert.match(TERMS_BODY, /intended for users in the \*\*United States\*\*/);
assert.match(TERMS_BODY, /not directed at people in other territories/);
assert.match(PRIVACY_BODY, /not directed at people in other territories/);
// The 18/21 mismatch is disclosed rather than glossed over.
assert.match(TERMS_BODY, /legal betting age is 21/);

// Billing is live: nothing may still claim Surf takes no money, and the paid
// plan, its price, the cancellation route and the Stripe disclosure must be stated.
for (const [name, body] of Object.entries({ terms: TERMS_BODY, privacy: PRIVACY_BODY })) {
  assert.doesNotMatch(body, /billing is (turned off|disabled)/i, `${name} still says billing is off`);
  assert.doesNotMatch(body, /not accepting payments|Not currently enabled|processes no payments/i, `${name} still denies payments`);
  assert.doesNotMatch(body, /should be before (Surf launches anything|any) paid/, `${name} still carries the pre-launch lawyer note`);
}
assert.match(TERMS_BODY, /\*\*Surf Pro\*\* at \$9\.99 per month/);
assert.match(TERMS_BODY, /never sees or stores your full card details/);
assert.match(TERMS_BODY, /cancel yourself from your \[account page\]\(\/account\)/);
assert.match(TERMS_BODY, /No partial refunds/);
assert.match(PRIVACY_BODY, /\*\*Billing data\.\*\*/);
assert.match(PRIVACY_BODY, /never sent to or stored by Surf/);
assert.match(PRIVACY_BODY, /stripe\.com\/privacy/);
assert.match(PRIVACY_BODY, /If you never subscribe, Stripe receives nothing about you from Surf/);

// Claims that must stay true and visible.
for (const body of [TERMS_BODY, METHODOLOGY_BODY]) {
  assert.match(body, /does not accept (or place )?wagers/);
  assert.match(body, /creativecommons\.org\/licenses\/by\/4\.0/);
}
assert.match(METHODOLOGY_BODY, /Kalshi is currently disabled/);
assert.match(PRIVACY_BODY, /East US \(Ohio\)/);
assert.match(PRIVACY_BODY, /no analytics/i);

// Routes exist and are wired into the shared footer on every page.
for (const route of ["terms", "privacy", "methodology"]) {
  const page = await readFile(new URL(`../app/${route}/page.tsx`, import.meta.url), "utf8");
  assert.match(page, /LegalDocument/);
}
const footer = await readFile(new URL("../components/surf/SurfLegalFooter.tsx", import.meta.url), "utf8");
for (const route of ["/terms", "/privacy", "/methodology"]) assert.ok(footer.includes(route), `footer is missing ${route}`);
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
assert.match(layout, /<SurfLegalFooter \/>/);

// The renderer must not open an HTML injection path.
const renderer = await readFile(new URL("../components/surf/LegalDocument.tsx", import.meta.url), "utf8");
assert.doesNotMatch(renderer, /dangerouslySetInnerHTML=/);

console.log("Legal pages passed: no placeholders, current helpline, consistent age and territory, paid plan and Stripe disclosed, attribution and storage location stated, routes and footer wired, renderer injection-free.");
