import assert from "node:assert/strict";
import { signalAnchorId, signalHref, signalIdFromHash } from "../lib/surf/signalLinks.ts";

const ids = ["simple", "same-team:second-market", "NYG/DAL +3?book=two#quoted", "équipe-日本語-%[1]\"", "123", "signal-already-prefixed", "literal%20escape%2F", "space tab\tline\nreturn\rform\f"];
for (const id of ids) {
  const path = signalHref(id, "americanfootball_ncaaf");
  const url = new URL(path, "http://10.0.0.28:3160");
  assert.equal(url.pathname, "/feed");
  assert.equal(url.searchParams.get("sport"), "americanfootball_ncaaf");
  assert.equal([...url.searchParams].length, 1, "ID punctuation cannot alter query parameters");
  assert.equal(decodeURIComponent(url.hash.slice(1)), signalAnchorId(id));
  assert.doesNotMatch(signalAnchorId(id), /[\t\n\f\r ]/, "HTML IDs cannot contain ASCII whitespace");
  assert.equal(signalIdFromHash(url.hash), id);
  assert.equal(new URL(path, "https://surf.example").host, "surf.example", "Links inherit the current device's origin");
}
assert.equal(new Set(ids.map(signalAnchorId)).size, ids.length);
for (const hash of ["", "#market-board", "#signal-", "#%", "#signal-%E0%A4%A"]) assert.equal(signalIdFromHash(hash), null, hash);
assert.equal(signalIdFromHash("#signal-a%25252Fb"), "a%2Fb", "Decode each escaping layer once, retaining literal percent sequences");
assert.notEqual(signalAnchorId("a b"), signalAnchorId("a%20b"), "Whitespace and literal escaped sequences have distinct anchors");
console.log(`Signal links passed: ${ids.length} ID round-trips, punctuation/Unicode safety, whitespace-free distinct anchors, origin-independent URLs, malformed fragments and one decode per escaping layer.`);
