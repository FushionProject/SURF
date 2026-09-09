import assert from "node:assert/strict";
import { get } from "node:http";

// Requires the explicit local preview. Visits only research/disabled stats pages,
// never Games, Signals, or a sports-provider endpoint. node:http honors Host.
const request = (route, host = "127.0.0.1:3164", port = 3164) => new Promise((resolve, reject) => {
  const req = get({ hostname: "127.0.0.1", port, path: route, headers: { Host: host } }, response => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", part => { body += part; if (body.length > 8_000_000) req.destroy(new Error("Response too large")); });
    response.on("end", () => resolve({ status: response.statusCode, body }));
  });
  req.setTimeout(30_000, () => req.destroy(new Error("Local preview timed out")));
  req.on("error", reject);
});
const page = await request("/stats/research/explore");
assert.equal(page.status, 200);
assert.match(page.body, /Win–loss–tie record/);
assert.match(page.body, /API-Sports game/);
assert.match(page.body, /2010–2020 is under review/);
const week = await request("/stats/research/explore?team=PIT&from=2021&to=2025&week=1");
assert.equal(week.status, 200);
assert.match(week.body, /5<!-- --> matching games/);
for (const route of [
  "/stats/research/explore?team=INVALID", "/stats/research/explore?from=2010", "/stats/research/explore?team=PIT&team=BUF",
  "/stats/research/explore?stage=playoffs&week=1", "/stats/research/explore?role=favorite",
]) {
  const response = await request(route);
  assert.match(response.body, /Results paused/);
  assert.doesNotMatch(response.body, /id="record-heading"/);
}
const playoffs = await request("/stats/research/explore?team=PIT&from=2021&to=2021&stage=playoffs");
assert.match(playoffs.body, /2021 playoff coverage is incomplete/);
for (const host of ["evil.example:3164", "localhost.evil.example:3164"]) {
  const response = await request("/stats/research/explore", host);
  assert.equal(response.status, 404);
  assert.doesNotMatch(response.body, /API-Sports game/);
}
const publicPage = await request("/stats");
assert.match(publicPage.body, /Waiting for real history/);
assert.doesNotMatch(publicPage.body, /API-Sports game/);
const feed = await request("/stats/research");
assert.equal(feed.status, 200);
assert.match(feed.body, /Standout history for this week/);
assert.match(feed.body, /Historical-reference spread results/);
assert.doesNotMatch(feed.body, /name="from"|name="week"/);
const firstGame = /<option value="(\d{4}_\d{2}_[A-Z]+_[A-Z]+)"/.exec(feed.body)?.[1];
if (firstGame) {
  assert.match(feed.body, /data-spot-card=/);
  const selected = await request(`/stats/research?game=${firstGame}`);
  assert.equal(selected.status, 200);
  const cardIds = [...selected.body.matchAll(/<article[^>]*id="(spot-[^"]+)"/g)].map(match => match[1]);
  assert.ok(cardIds.length > 0);
  assert.ok(cardIds.every(id => id.startsWith(`spot-${firstGame}-`)));
} else assert.match(feed.body, /No matching spots yet/);
for (const query of ["game=bad", "game=all&game=all", "team=PIT", "minimumSample=1"]) {
  const bad = await request(`/stats/research?${query}`);
  assert.match(bad.body, /Stats paused/);
  assert.doesNotMatch(bad.body, /data-spot-card=/);
}
for (const host of ["evil.example:3164", "localhost.evil.example:3164"]) {
  const response = await request("/stats/research", host);
  assert.equal(response.status, 404);
  assert.doesNotMatch(response.body, /data-spot-card=/);
}
assert.doesNotMatch(publicPage.body, /data-spot-card=/);
console.log("HTTP research preview passed: real feed/matchup links, strict input errors, result explorer, coverage warnings, both local guards and unchanged public stats.");
