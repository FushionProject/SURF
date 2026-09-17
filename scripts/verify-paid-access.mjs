import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { paidAccessRequired } from "../lib/billing/access-policy.ts";
assert.equal(paidAccessRequired({ NODE_ENV: "production" }), true);
assert.equal(paidAccessRequired({ NODE_ENV: "production", SURF_PAID_ACCESS_ENFORCED: "false" }), true);
assert.equal(paidAccessRequired({ NODE_ENV: "development" }), false);
assert.equal(paidAccessRequired({ NODE_ENV: "development", SURF_PAID_ACCESS_ENFORCED: "true" }), true);
const route = await readFile(new URL("../app/api/surf-feed/route.ts", import.meta.url), "utf8");
const get = route.slice(route.indexOf("export async function GET(request"));
// The viewer's access is resolved once, before any demo or provider path, and
// every serialized feed (live, debug, demo, fallback) goes through the gate.
assert.match(get, /const pro = await viewerHasPro\(\);/);
assert.ok(get.indexOf("await viewerHasPro()") < get.indexOf("isSurfDemoMode()"));
assert.ok(get.indexOf("await viewerHasPro()") < get.indexOf("getLiveSurfFeed(request, pro)"));
assert.equal((get.match(/getDemoSurfFeed\(/g) ?? []).length, 0, "demo feeds are served only through the gate");
assert.equal((get.match(/gatedDemoFeed\(/g) ?? []).length, 3);
assert.doesNotMatch(route, /paidFeatureDenial/);
// runRopeAudit still receives the full slate (telemetry); no response body does.
assert.doesNotMatch(route, /count: taggedSignals\.length/, "the full slate is never serialized");
assert.equal((route.match(/count: gated\.signals\.length/g) ?? []).length, 3);
assert.equal((route.match(/signals: gated\.signals,/g) ?? []).length, 3);
assert.equal((route.match(/locked: gated\.locked/g) ?? []).length, 3);
assert.equal((route.match(/moves: keepFeaturedOnly\(overnight\.moves, gated\.locked\)/g) ?? []).length, 2, "overnight moves follow the same lock");
assert.doesNotMatch(route, /^\s*overnight,$/m, "the unfiltered overnight summary is never serialized");
assert.match(route, /gateSignalsForViewer\(taggedSignals, featurableSlate\(filteredGames\), pro\)/);
assert.match(get, /Cache-Control.*private, no-store/);
const feedPage = await readFile(new URL("../app/feed/page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(feedPage, /paidFeatureDenial|Signals plan/, "the Signals page no longer walls off free viewers");
assert.match(feedPage, /<SurfEditorial view="signals" \/>/);
const editorial = await readFile(new URL("../components/surf-editorial/SurfEditorial.tsx", import.meta.url), "utf8");
assert.match(editorial, /data\?\.feed\?\.locked && !data\.feed\.locked\.pro/);
assert.match(editorial, /Get Surf Pro · \$9\.99\/month/);
console.log("Paid access policy and featured-game feed gate passed (static contract; not live checkout).");
const board = await readFile(new URL("../app/api/game-summaries/route.ts", import.meta.url), "utf8");
assert.match(board, /predictionMarketWhaleSignals: paidAccessRequired\(\) \? \[\] : predictionMarketSnapshot.whaleSignals/);
const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
assert.ok(proxy.includes('"/feed"') && proxy.includes('"/api/surf-feed"'));
