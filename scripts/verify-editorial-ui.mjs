// Optional browser parity test. Replays one captured local response set; it never
// sends UI refreshes to providers. Requires Playwright and two local app URLs.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const preview = process.argv[2];
const source = process.argv[3];
assert(preview && source, "Provide preview and current-app origins");
for (const value of [preview, source]) assert(["localhost", "127.0.0.1"].includes(new URL(value).hostname), "Local previews only");
const sports = ["americanfootball_nfl", "baseball_mlb", "americanfootball_ncaaf"];
const captured = new Map();
for (const sport of sports) {
  await Promise.all(["surf-games", "surf-feed"].map(async endpoint => {
    const response = await fetch(`${source}/api/${endpoint}?sport=${sport}&refreshMode=dynamic`);
    assert.equal(response.status, 200, `${sport} ${endpoint}`);
    const payload = await response.json();
    if (endpoint === "surf-games") {
      assert(!payload.games.some(game => game.bookmakers?.some(book => book.key === "betparx")), `${sport}: removed book returned`);
    }
    captured.set(`${endpoint}:${sport}`, payload);
  }));
}
const rankings = await fetch(`${source}/api/cfb-rankings`);
captured.set("cfb-rankings", await rankings.json());
console.log("Captured live responses", sports.map(sport => ({ sport, games: captured.get(`surf-games:${sport}`).games.length, signals: captured.get(`surf-feed:${sport}`).signals.length })));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Los_Angeles" });
  await context.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").at(-1);
    const key = endpoint === "cfb-rankings" ? endpoint : `${endpoint}:${url.searchParams.get("sport")}`;
    const data = captured.get(key);
    if (!data) return route.fulfill({ status: 503, json: { error: "Uncaptured test request" } });
    await route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  async function noOverflow() {
    const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert(sizes.scroll <= sizes.width + 1, `Overflow ${JSON.stringify(sizes)}`);
  }
  for (const sport of sports) {
    await page.goto(`${preview}/games?sport=${sport}`);
    await page.locator(".bn-game").first().waitFor();
    const card = page.locator(".bn-game").first();
    await card.getByText("Surf Market Read", { exact: true }).waitFor();
    await card.getByText("Prediction markets", { exact: true }).waitFor();
    assert.equal(await card.getByText(/Large-trade direction|Large-trade activity/).count(), 0);
    assert.equal(await page.locator('.bn-masthead a[href="/how-to-use"]').count(), 1);
    assert.equal(await page.locator(".bn-art-bars").count(), 0);
    assert.match(await page.locator(".bn-art-bottom").innerText(), /SEE HOW THE\s+MARKET FLOWS/);
    assert.equal(await card.getByRole("button", { name: "Compare all sportsbook quotes" }).count(), 1);
    await card.getByRole("button", { name: "Compare all sportsbook quotes" }).click();
    assert(await card.locator("table tbody tr").count() > 0);
    await card.locator("details").filter({ has: page.locator("summary", { hasText: "Line history" }) }).locator("summary").click();
    assert(await card.getByRole("img", { name: /history/ }).count() > 0);
    if (sport === "americanfootball_nfl") {
      await page.getByRole("textbox", { name: "Search teams" }).fill("DAL at NYG");
      assert.equal(await page.locator(".bn-game").count(), 1);
      await page.getByRole("textbox", { name: "Search teams" }).fill("");
    }
    if (sport === "americanfootball_ncaaf" && captured.get("cfb-rankings").status === "available") {
      const before = await page.locator(".bn-game").count();
      await page.getByRole("checkbox", { name: "AP Top 25 only" }).check();
      const after = await page.locator(".bn-game").count();
      assert(after > 0 && after < before, `AP filter ${before}→${after}`);
    }
    await noOverflow();
    if (sport === "americanfootball_nfl" && process.env.SURF_UI_SCREENSHOT) {
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.evaluate(() => document.documentElement.dataset.surfMode = "dark");
      await page.locator(".bn-game").first().screenshot({ path: `${process.env.SURF_UI_SCREENSHOT}-game.png` });
      await noOverflow();
    }
    await page.goto(`${preview}/feed?sport=${sport}&type=whales`);
    await page.locator(".bn-current-signals").waitFor();
    assert.equal(await page.getByRole("button", { name: /Whale activity|Market opportunities/ }).count(), 0);
    assert.equal(await page.getByText(/Coverage & checks|Evidence & method/).count(), 0);
    assert(!new URL(page.url()).searchParams.has("type"));
    const count = await page.locator(".bn-signal-card").count();
    if (count) {
      const signal = page.locator(".bn-signal-card").first();
      assert.equal(await signal.locator(".bn-card-logo").count(), 2);
      assert.match(await signal.locator(".bn-card-meta time").innerText(), /(?:Verified|Filled|Moved|Changed|Observed).*PDT/);
      assert(await signal.locator(".bn-card-quotes, .bn-card-execution").count() > 0);
      assert.equal(await signal.locator(".bn-card-method").count(), 0);
    }
    for (const theme of ["dark", "light"]) {
      await page.evaluate(mode => document.documentElement.dataset.surfMode = mode, theme);
      for (const width of [320, 390, 640, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await noOverflow();
        const typography = await page.evaluate(() => ({
          statsLabel: parseFloat(getComputedStyle(document.querySelector(".bn-stats > div > span")).fontSize),
          statsCaption: parseFloat(getComputedStyle(document.querySelector(".bn-stats small")).fontSize),
          briefing: parseFloat(getComputedStyle(document.querySelector(".bn-rail-intro")).fontSize),
        }));
        assert(typography.statsLabel >= 11 && typography.statsCaption >= 12 && typography.briefing >= 14, JSON.stringify(typography));
        assert(await page.locator('.bn-masthead a[href="/how-to-use"]').isVisible());
        if (sport === "americanfootball_nfl" && width === 390 && count && process.env.SURF_UI_SCREENSHOT) {
          await page.locator(".bn-signal-card").first().screenshot({ path: `${process.env.SURF_UI_SCREENSHOT}-signal-${theme}.png` });
        }
      }
    }
  }
  // Test-only mixed fixtures exercise empty-market edge cases without fabricating
  // anything in the product or persisting trades. All responses stay intercepted.
  const now = Date.now();
  const game = captured.get("surf-games:americanfootball_nfl").games[0];
  const base = { id: "ui-test-only", game: { id: game.id, sportKey: "americanfootball_nfl", league: "NFL", homeTeam: game.home_team, awayTeam: game.away_team }, commenceTime: game.commence_time, title: "Test-only current comparison", signalType: "Book Disagreement", market: "spreads", detail: "Two current offers", insight: "Test-only evidence", strengthScore: 80, lastSeenAt: now, detectedAt: now };
  const whale = { ...base, id: "ui-whale", title: "Test-only executed buying burst", whaleActivity: { venue: "kalshi", venueLabel: "Kalshi", activityKind: "buying_burst", isAnonymous: true, committedUsd: 12000, contracts: 20000, averagePrice: 0.6, tradeCount: 3, occurredAt: now - 5000, outcomeTeam: game.home_team, sourceUrl: "https://kalshi.com" } };
  const middle = { ...base, id: "ui-middle", title: "Test-only middle", opportunity: { kind: "best_line", isMiddle: true, middleWidth: 1, reason: "Test-only middle evidence", selection: game.away_team, bookTitle: "FanDuel", booksCompared: 10 }, valueOptions: [{ selection: game.away_team, book: "FanDuel", line: "+3.5", price: "-110" }, { selection: game.home_team, book: "DraftKings", line: "-2.5", price: "-110" }] };
  whale.strengthScore = 63;
  whale.isTopSignal = true; // A stale legacy flag must not bypass the shared rating cutoff.
  middle.strengthScore = 86;
  const largeWhale = { ...whale, id: "ui-large-whale", title: "Test-only large executed buy", strengthScore: 93, whaleActivity: { ...whale.whaleActivity, committedUsd: 100000, occurredAt: now - 10000 } };
  const longshot = { ...base, id: "ui-longshot", title: "Test-only longshot", strengthScore: 51, market: "h2h", opportunity: { kind: "best_price", price: 2000, consensusPrice: 1239, selection: game.away_team, bookTitle: "FanDuel", booksCompared: 6 } };
  captured.set("surf-feed:americanfootball_nfl", { sportKey: "americanfootball_nfl", dataSource: "demo", dataNotice: "Test-only browser fixtures", signals: [middle, whale, longshot, largeWhale, { ...whale, id: "ui-expired", commenceTime: new Date(now - 1).toISOString() }] });
  await page.goto(`${preview}/feed?sport=americanfootball_nfl`);
  await page.locator(".bn-current-signals").waitFor();
  assert.equal(await page.locator(".bn-signal-card").count(), 4);
  const first = page.locator(".bn-signal-card").first();
  await first.getByText("$100,000", { exact: true }).waitFor();
  await first.getByText("Anonymous buying burst · may include multiple traders").waitFor();
  const second = page.locator(".bn-signal-card").nth(1);
  assert.equal(await second.locator(".bn-card-quotes > div").count(), 2);
  await page.locator(".bn-signal-card").nth(2).getByText("$12,000", { exact: true }).waitFor();
  await page.locator(".bn-signal-card").nth(3).getByText(/Longshot price · lower priority/).waitFor();
  assert.match(await page.locator(".bn-rail-signal").first().innerText(), /Test-only large executed buy/);
  await page.getByRole("checkbox", { name: "Top signals only" }).check();
  assert.equal(await page.locator(".bn-signal-card").count(), 2, "Top only keeps actual strong ratings, not every old flagged opportunity");
  await page.getByRole("checkbox", { name: "Top signals only" }).uncheck();
  await page.setViewportSize({ width: 390, height: 1000 });
  await noOverflow();
  assert.deepEqual(errors, [], "Browser errors including hydration");
  console.log("Editorial UI passed: NFL/MLB/CFB, simplified cards, guide navigation, larger text, timezone times, unified whales, two-leg middle, kickoff expiry, AP filter/search, graphs, themes and five widths.");
} finally { await browser.close(); }
