// Offline browser regression: every API response is synthetic and intercepted.
// No provider calls, captured customer data, API credentials, or stored fixtures.
import assert from "node:assert/strict";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const origin = process.argv[2] ?? "http://localhost:3158";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use a local preview origin");
const sport = "americanfootball_ncaaf";
const firstTime = Date.parse("2026-09-07T18:00:00Z");
const minute = 60_000;
const timestamp = offset => new Date(firstTime + offset * minute).toISOString();
const point = (offset, spread, total = 55) => ({ timestamp: timestamp(offset), spreadAvg: spread, totalAvg: total });
const cases = [
  { name: "diagonal", points: [point(0, -54), point(30, -54.5, 56.5)], changes: 1 },
  { name: "single", points: [point(0, -54)], changes: 0 },
  { name: "unchanged", points: [point(0, -54), point(30, -54)], changes: 0 },
  { name: "tracking-gap", points: [point(0, -54), point(240, -54.5)], changes: 1, gap: true },
  { name: "missing-observation", points: [point(0, -54), point(10, null, null), point(30, -54.5)], changes: 1, gap: true },
  { name: "many-changes", points: [0, 1, 2, 3, 4, 5].map(n => point(n * 5, -54 - n * 0.5)), changes: 5 },
  { name: "empty", points: [], changes: 0 },
];

function gamesFixture(testCase) {
  const now = Date.now();
  const game = {
    id: "offline-movement-chart-fixture",
    sport_key: sport,
    sport_title: "NCAAF",
    commence_time: new Date(now + 24 * 60 * minute).toISOString(),
    home_team: "Miami Hurricanes",
    away_team: "Florida A&M Rattlers",
    bookmakers: [["draftkings", "DraftKings"], ["fanduel", "FanDuel"], ["fanatics", "Fanatics"]].map(([key, title]) => ({
      key, title, last_update: new Date(now).toISOString(),
      markets: [
        { key: "spreads", outcomes: [{ name: "Miami Hurricanes", point: -54.5, price: -110 }, { name: "Florida A&M Rattlers", point: 54.5, price: -110 }] },
        { key: "totals", outcomes: [{ name: "Over", point: 56.5, price: -110 }, { name: "Under", point: 56.5, price: -110 }] },
      ],
    })),
  };
  const first = testCase.points[0];
  const latest = testCase.points.at(-1);
  return {
    sportKey: sport,
    dataSource: "demo",
    dataNotice: "Offline chart regression fixture",
    games: [game],
    marketAverage: {
      [game.id]: {
        gameKey: game.id,
        historySource: "local",
        lastObservedAt: latest?.timestamp,
        openSpreadAvg: first?.spreadAvg ?? null,
        currentSpreadAvg: latest?.spreadAvg ?? null,
        peakSpreadAvg: latest?.spreadAvg ?? null,
        openTotalAvg: first?.totalAvg ?? null,
        currentTotalAvg: latest?.totalAvg ?? null,
        peakTotalAvg: latest?.totalAvg ?? null,
        lastMovedAt: testCase.changes ? latest?.timestamp : null,
        spreadHistory: testCase.points,
        totalHistory: testCase.points,
      },
    },
  };
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, timezoneId: "America/Los_Angeles" });
  let activeCase = cases[0];
  const intercepted = new Set();
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    // No external requests, including team logo fetches, are needed for this test.
    if (url.origin !== new URL(origin).origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    intercepted.add(url.pathname);
    if (url.pathname === "/api/surf-games") return route.fulfill({ json: gamesFixture(activeCase) });
    if (url.pathname === "/api/surf-feed") return route.fulfill({ json: { sportKey: sport, dataSource: "demo", signals: [] } });
    if (url.pathname === "/api/cfb-rankings") return route.fulfill({ json: { status: "unavailable", rankings: [], notice: "Offline chart fixture" } });
    return route.fulfill({ status: 503, json: { error: "Offline test: endpoint not available" } });
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|hydrating|server rendered/i.test(message.text())) browserErrors.push(message.text());
  });

  async function noOverflow(label) {
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    assert(dimensions.content <= dimensions.viewport + 1, `${label}: page overflow ${JSON.stringify(dimensions)}`);
    const ticks = await page.locator('[data-testid="movement-chart"] .surf-movement-tick text').evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      const svg = element.ownerSVGElement.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, chartLeft: svg.left, chartRight: svg.right };
    }));
    for (const tick of ticks) assert(tick.left >= tick.chartLeft - 1 && tick.right <= tick.chartRight + 1, `${label}: clipped timestamp ${JSON.stringify(tick)}`);
    for (let i = 1; i < ticks.length; i++) assert(ticks[i].left >= ticks[i - 1].right, `${label}: overlapping timestamps`);
  }

  for (const testCase of cases) {
    activeCase = testCase;
    await page.goto(`${origin}/games?sport=${sport}`);
    const card = page.locator(".bn-game").first();
    await card.waitFor();
    const history = card.locator(".bn-history-disclosure");
    await history.locator(":scope > summary").click();
    const chart = history.getByTestId("movement-chart");
    await chart.waitFor({ state: "visible" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const points = testCase.points.filter(item => item.spreadAvg !== null);
    assert.equal(await chart.locator("circle[data-time]").count(), points.length, `${testCase.name}: observed points only`);
    const paths = await chart.locator("[data-movement-segment]").evaluateAll(elements => elements.map(element => ({ d: element.getAttribute("d"), dash: element.getAttribute("stroke-dasharray") })));
    assert.equal(paths.length, Math.max(0, points.length - 1), `${testCase.name}: segment count`);
    for (const path of paths) {
      assert.match(path.d, /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/, `${testCase.name}: direct line, not stair steps`);
      assert(!/[HV]/.test(path.d), `${testCase.name}: no staircase commands`);
    }
    const changeItems = chart.locator(".surf-movement-changes > li");
    assert.equal(await changeItems.count(), Math.min(3, testCase.changes), `${testCase.name}: recent movements are immediately visible`);
    if (testCase.name === "diagonal") {
      const coordinates = paths[0].d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      assert(coordinates[0] !== coordinates[2] && coordinates[1] !== coordinates[3], "Changed line is diagonal");
      assert.match(await changeItems.first().innerText(), /11:30 AM PDT/);
      assert.match(await changeItems.first().innerText(), /-54 → -54\.5/);
      assert.equal(await changeItems.locator("time").getAttribute("datetime"), timestamp(30));
      assert.match(await chart.locator(".surf-movement-tick").last().textContent(), /11:30 AM/);
      await history.getByRole("button", { name: "Total", exact: true }).click();
      await chart.getByText("Market average total", { exact: true }).waitFor();
      assert.match(await changeItems.first().innerText(), /55 → 56\.5/);
      await history.getByRole("button", { name: "Spread", exact: true }).click();
    }
    if (testCase.gap) {
      assert(paths.some(path => path.dash), `${testCase.name}: unknown interval stays dotted`);
      assert.match(await chart.innerText(), /Observed after a tracking gap/);
    }
    if (testCase.name === "many-changes") {
      const earlier = chart.locator("details");
      await earlier.locator("summary").click();
      assert.equal(await earlier.locator("li").count(), 2, "Earlier change timestamps remain available");
      assert.equal(await earlier.locator("time").last().getAttribute("datetime"), timestamp(5));
    }
    if (testCase.name === "single") assert.match(await chart.innerText(), /Collecting history/);
    if (testCase.name === "unchanged") assert.match(await chart.innerText(), /No change observed/);
    if (testCase.name === "empty") assert.match(await chart.innerText(), /No recorded line history/);
    for (const theme of ["dark", "light"]) {
      await page.evaluate(mode => { document.documentElement.dataset.surfMode = mode; }, theme);
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await noOverflow(`${testCase.name}/${theme}/${width}`);
        if (testCase.name === "diagonal" && width === 390 && process.env.SURF_MOVEMENT_SCREENSHOT) {
          await chart.screenshot({ path: `${process.env.SURF_MOVEMENT_SCREENSHOT}-${theme}.png` });
        }
      }
    }
  }
  assert.deepEqual(browserErrors, [], "No browser or hydration errors");
  assert(intercepted.has("/api/surf-games") && intercepted.has("/api/surf-feed"), "Fixture API interception was exercised");
  console.log("Movement chart UI passed: diagonal segments, local movement timestamps, market switching, retained gaps, single/empty/unchanged histories, earlier movements, dark/light and 320/390/1440px; no provider requests.");
} finally {
  await browser.close();
}
