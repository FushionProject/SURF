import assert from "node:assert/strict";
import { get } from "node:http";

// Requires the explicit local preview. Visits only research/disabled stats pages,
// never Games, Signals, or a sports-provider endpoint. node:http honors Host.
const request = (route, host = "127.0.0.1:3162", port = 3162) => new Promise((resolve, reject) => {
  const req = get({ hostname: "127.0.0.1", port, path: route, headers: { Host: host } }, response => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", part => { body += part; if (body.length > 8_000_000) req.destroy(new Error("Response too large")); });
    response.on("end", () => resolve({ status: response.statusCode, body }));
  });
  req.setTimeout(30_000, () => req.destroy(new Error("Local preview timed out")));
  req.on("error", reject);
});
const page = await request("/stats/research");
assert.equal(page.status, 200);
assert.match(page.body, /Win–loss–tie record/);
assert.match(page.body, /API-Sports game/);
assert.match(page.body, /2010–2020 is under review/);
const week = await request("/stats/research?team=PIT&from=2021&to=2025&week=1");
assert.equal(week.status, 200);
assert.match(week.body, /5<!-- --> matching games/);
for (const route of [
  "/stats/research?team=INVALID", "/stats/research?from=2010", "/stats/research?team=PIT&team=BUF",
  "/stats/research?stage=playoffs&week=1", "/stats/research?role=favorite",
]) {
  const response = await request(route);
  assert.match(response.body, /Results paused/);
  assert.doesNotMatch(response.body, /id="record-heading"/);
}
const playoffs = await request("/stats/research?team=PIT&from=2021&to=2021&stage=playoffs");
assert.match(playoffs.body, /2021 playoff coverage is incomplete/);
for (const host of ["evil.example:3162", "localhost.evil.example:3162"]) {
  const response = await request("/stats/research", host);
  assert.equal(response.status, 404);
  assert.doesNotMatch(response.body, /API-Sports game/);
}
const publicPage = await request("/stats");
assert.match(publicPage.body, /Waiting for real history/);
assert.doesNotMatch(publicPage.body, /API-Sports game/);
console.log("HTTP research preview passed: real cached results, filters, errors, partial coverage, loopback guard, unchanged disabled public stats page.");
