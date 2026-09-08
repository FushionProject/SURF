// Offline browser regression: all API responses are synthetic and intercepted.
// No upstream provider calls, credentials or real trading data are used.
import assert from "node:assert/strict";
import { signalAnchorId, signalHref } from "../lib/surf/signalLinks.ts";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const origin = new URL(process.argv[2] ?? "http://localhost:3160").origin;
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use a local preview origin");
const sport = "americanfootball_nfl";
const now = Date.now();
const kickoff = new Date(now + 24 * 60 * 60_000).toISOString();
const targetId = 'test:NYG/DAL +3?book=two#équipe%[1]"';
const targetAnchor = signalAnchorId(targetId);
const targetTitle = "Test-only moderate longshot comparison";
const game = {
  id: "offline-readability-game", sport_key: sport, sport_title: "NFL", commence_time: kickoff,
  away_team: "Dallas Cowboys", home_team: "New York Giants",
  bookmakers: [["draftkings", "DraftKings"], ["fanduel", "FanDuel"], ["fanatics", "Fanatics"]].map(([key, title]) => ({
    key, title, last_update: new Date(now).toISOString(),
    markets: [{ key: "spreads", outcomes: [{ name: "Dallas Cowboys", point: 3.5, price: -110 }, { name: "New York Giants", point: -3.5, price: -110 }] }],
  })),
};
const base = {
  game: { id: game.id, sportKey: sport, league: "NFL", awayTeam: game.away_team, homeTeam: game.home_team },
  commenceTime: kickoff, signalType: "Best Number", market: "spreads", detectedAt: now, lastSeenAt: now,
  detail: "Offline test quotes", insight: "Detection criteria must not be the consumer explanation",
};
const signals = [
  { ...base, id: "test-whale", title: "Test-only large executed buy", strengthScore: 93, signalType: "Whale Activity", whaleActivity: {
    venue: "kalshi", venueLabel: "Kalshi", activityKind: "large_trade", isAnonymous: true, committedUsd: 100000,
    contracts: 200000, averagePrice: 0.5, tradeCount: 1, occurredAt: now - 5000, outcomeTeam: game.home_team, sourceUrl: "https://kalshi.com",
  } },
  { ...base, id: "test-middle", title: "Test-only two-point middle", strengthScore: 86, opportunity: {
    kind: "best_line", isMiddle: true, middleWidth: 2, middleOutsideCostPercentage: 5, reason: "Technical curation criteria", selection: game.away_team, price: -110,
    bookTitle: "FanDuel", booksCompared: 9,
    middleLegs: [{ selection: game.away_team, bookTitle: "FanDuel", point: 4.5, price: -110 }, { selection: game.home_team, bookTitle: "DraftKings", point: -2.5, price: -110 }],
  } },
  { ...base, id: targetId, title: targetTitle, market: "h2h", strengthScore: 52, opportunity: {
    kind: "best_price", price: 2000, consensusPrice: 1239, selection: game.away_team, bookTitle: "FanDuel", booksCompared: 6,
  } },
  { ...base, id: `${targetId}-title`, title: "Test-only quiet current comparison", strengthScore: 35, opportunity: {
    kind: "best_line", selection: game.home_team, point: 3.5, consensusPoint: 3, price: -125, bookTitle: "DraftKings", booksCompared: 3,
  } },
];
const gamesPayload = { sportKey: sport, dataSource: "demo", dataNotice: "Offline readability fixture", games: [game] };
const feedPayload = { sportKey: sport, dataSource: "demo", signals };
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [];
const apiRequests = [];
let feedStatus = 200;
let responseDelay = 350;

async function setupContext({ mobile = false } = {}) {
  const browserOrigin = mobile ? "http://surf-mobile.test:3160" : origin;
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: 1000 }, timezoneId: "America/Los_Angeles" });
  await context.addInitScript(({ manualClipboard }) => {
    window.__signalScrolls = [];
    window.__copiedSignalLink = "";
    const scroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args) {
      window.__signalScrolls.push(this.id);
      return scroll.apply(this, args);
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: manualClipboard ? undefined : {
      writeText: async value => { window.__copiedSignalLink = value; },
    } });
  }, { manualClipboard: mobile });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== browserOrigin) return route.abort();
    if (url.pathname.startsWith("/api/")) {
      apiRequests.push(url.pathname);
      if (responseDelay) await new Promise(resolve => setTimeout(resolve, responseDelay));
      if (url.pathname === "/api/surf-games") return route.fulfill({ json: gamesPayload });
      if (url.pathname === "/api/surf-feed") return route.fulfill({ status: feedStatus, json: feedStatus === 200 ? feedPayload : { error: "Offline source unavailable" } });
      return route.fulfill({ status: 503, json: { error: "Offline test endpoint unavailable" } });
    }
    // A fake non-loopback HTTP origin exercises actual insecure-context behavior,
    // but every page/static request is served only by the provided local preview.
    if (mobile) return route.fulfill({ response: await route.fetch({ url: `${origin}${url.pathname}${url.search}` }) });
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|hydrating|server rendered/i.test(message.text())) errors.push(message.text());
  });
  page.setDefaultTimeout(10_000);
  return { page, context, browserOrigin };
}

async function waitForTarget(page, id = targetAnchor) {
  await page.waitForFunction(anchor => document.activeElement?.id === anchor, id);
  const bounds = await page.evaluate(anchor => {
    const element = document.getElementById(anchor);
    const rectangle = element.getBoundingClientRect();
    return { top: rectangle.top, bottom: rectangle.bottom, viewport: innerHeight };
  }, id);
  assert(bounds.top >= -1 && bounds.top < 110, `Direct link aligns the target near the top: ${JSON.stringify(bounds)}`);
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert(dimensions.content <= dimensions.width + 1, `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
}

try {
  const { page, context } = await setupContext();
  await page.clock.install({ time: new Date(now) });
  await page.goto(`${origin}${signalHref(targetId, sport)}`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator(".bn-signal-card").count(), 0, "Fragment arrives before delayed feed cards");
  await waitForTarget(page);
  assert.equal(await page.locator(".bn-signal-card").count(), 4);
  for (const signal of signals) assert.equal(await page.getByRole("article", { name: signal.title, exact: true }).count(), 1, "Each card has one unique, correct accessible name");
  const cardIdentifiers = await page.locator(".bn-signal-card").evaluateAll(cards => cards.map(card => ({ id: card.id, label: card.getAttribute("aria-labelledby"), title: card.querySelector("h3").id })));
  const allIdentifiers = cardIdentifiers.flatMap(card => [card.id, card.title]);
  assert.equal(new Set(allIdentifiers).size, allIdentifiers.length, "Card and heading IDs do not collide, including provider IDs ending in -title");
  for (const card of cardIdentifiers) {
    assert.doesNotMatch(card.id, /[\t\n\f\r ]/, "Card ID is valid HTML without whitespace");
    assert.equal(card.label, card.title, "aria-labelledby references exactly the matching headline");
    assert.doesNotMatch(card.label, /[\t\n\f\r ]/, "Accessible label is one ID, not an accidental IDREF list");
  }
  assert.equal(await page.locator("#signal-link-unavailable").count(), 0);
  assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)), targetAnchor);
  await page.waitForFunction(() => document.querySelector(".bn-card-meta time")?.textContent.includes("PDT"));

  // Ordinary clock and fetched-data updates must not drag a reader back to the link.
  await page.evaluate(() => { window.scrollTo(0, 0); });
  const previousScrolls = await page.evaluate(() => window.__signalScrolls.length);
  const previousRequests = apiRequests.filter(path => path === "/api/surf-feed").length;
  responseDelay = 0;
  await page.clock.fastForward(61 * 60_000);
  await page.waitForFunction(() => document.querySelector(".bn-current-signals")?.textContent.includes("4 current"));
  await page.waitForTimeout(50);
  assert(apiRequests.filter(path => path === "/api/surf-feed").length > previousRequests, "Scheduled data refresh exercised");
  assert.equal(await page.evaluate(() => window.__signalScrolls.length), previousScrolls, "Data and clock updates do not repeat direct-link scrolling");
  assert.equal(await page.evaluate(() => window.scrollY), 0);

  // Same feed: target is the third briefing item, with moderate strength, so both
  // search and Top-only filters can hide it. Clicking must reveal the exact card.
  await page.getByRole("textbox", { name: "Search teams" }).fill("unmatched-test-search");
  await page.getByRole("checkbox", { name: "Top signals only" }).check();
  assert.equal(await page.locator(".bn-signal-card").count(), 0);
  await page.locator(".bn-rail-signal").getByRole("link", { name: targetTitle, exact: true }).click();
  await waitForTarget(page);
  assert.equal(await page.getByRole("textbox", { name: "Search teams" }).inputValue(), "");
  assert.equal(await page.getByRole("checkbox", { name: "Top signals only" }).isChecked(), false);
  const scrollsBeforeRepeat = await page.evaluate(() => window.__signalScrolls.length);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(".bn-rail-signal").getByRole("link", { name: targetTitle, exact: true }).click();
  await page.waitForFunction(previous => window.__signalScrolls.length > previous, scrollsBeforeRepeat);
  await waitForTarget(page);
  assert(await page.evaluate(() => window.__signalScrolls.length) > scrollsBeforeRepeat, "Clicking the same fragment again still jumps to the card");

  // Copy URL uses current browser origin and the exact stable ID, never feed index.
  const target = page.locator(".bn-signal-card").filter({ has: page.getByRole("heading", { name: targetTitle, exact: true }) });
  await target.getByRole("button", { name: "Copy link to this signal" }).click();
  await target.getByRole("status").getByText("Link copied", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__copiedSignalLink), `${origin}${signalHref(targetId, sport)}`);
  assert.equal(await target.getByRole("textbox", { name: "Direct link to this signal" }).count(), 0);

  for (const theme of ["dark", "light"]) {
    await page.evaluate(value => { document.documentElement.dataset.surfMode = value; }, theme);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(page, `${theme}/${width}`);
      const cards = await page.locator(".bn-signal-card").evaluateAll(elements => elements.map(card => {
        const meter = card.querySelector('[role="meter"]');
        const heading = card.querySelector("h3");
        const meaning = card.querySelector(".bn-card-meaning p");
        const meta = card.querySelector(".bn-card-meta");
        return {
          score: Number(meter.getAttribute("aria-valuenow")), label: meter.textContent.trim(),
          min: meter.getAttribute("aria-valuemin"), max: meter.getAttribute("aria-valuemax"), valueText: meter.getAttribute("aria-valuetext"),
          meterTop: meter.getBoundingClientRect().top, metaTop: meta.getBoundingClientRect().top,
          headingTop: heading.getBoundingClientRect().top, meaningTop: meaning.getBoundingClientRect().top,
          meterFont: parseFloat(getComputedStyle(meter.querySelector("strong")).fontSize),
          bodyFont: parseFloat(getComputedStyle(meaning).fontSize),
          headingFont: parseFloat(getComputedStyle(heading).fontSize),
          meaning: meaning.textContent, meaningCount: card.querySelectorAll(".bn-card-meaning").length,
        };
      }));
      assert.deepEqual(cards.map(card => card.score), [93, 86, 52, 35], "Presentation preserves score order and values");
      assert.deepEqual(cards.map(card => card.label), ["Strong signal", "Strong signal", "Moderate signal", "Quiet signal"]);
      for (const card of cards) {
        assert(card.meterTop < card.metaTop && card.metaTop < card.headingTop && card.headingTop < card.meaningTop, "Strength precedes metadata/headline; meaning follows headline");
        assert(card.meterFont >= 20 && card.bodyFont >= 16 && card.headingFont >= 23, `Readable typography ${JSON.stringify(card)}`);
        assert.equal(card.meaningCount, 1);
        assert.equal(card.min, "0"); assert.equal(card.max, "100");
        assert.match(card.valueText, /not chance of winning/);
        assert.doesNotMatch(card.meaning, /Technical curation|Detection criteria/);
      }
      assert.equal(await page.getByText(/Coverage & checks|Evidence & method/).count(), 0);
      if (process.env.SURF_READABILITY_SCREENSHOT && width === 390) {
        await target.screenshot({ path: `${process.env.SURF_READABILITY_SCREENSHOT}-${theme}.png` });
      }
    }
  }

  // A game-board briefing link opens the Signals route and focuses its card.
  await page.goto(`${origin}/games?sport=${sport}`);
  await page.locator(".bn-game").first().waitFor();
  await page.locator(".bn-rail-signal").getByRole("link", { name: targetTitle, exact: true }).click();
  await waitForTarget(page);
  assert.equal(new URL(page.url()).pathname, "/feed");

  // Unknown/expired deep links stay honest instead of resurrecting historical cards.
  await page.goto(`${origin}${signalHref("expired-id", sport)}`);
  await waitForTarget(page, "signal-link-unavailable");
  assert.match(await page.locator("#signal-link-unavailable").innerText(), /no longer in the current feed/);
  assert.equal(await page.locator(".bn-signal-card").count(), 4);
  await page.getByRole("link", { name: "Browse current signals ↓", exact: true }).click();
  assert.equal(await page.locator("#signal-link-unavailable").count(), 0);
  assert.equal(new URL(page.url()).hash, "#market-board");
  feedStatus = 503;
  await page.goto(`${origin}${signalHref(targetId, sport)}`);
  await page.reload(); // A fragment-only navigation does not refetch the feed.
  await page.locator(".bn-current-signals").waitFor();
  assert.equal(await page.locator("#signal-link-unavailable").count(), 0, "An unavailable provider is not falsely called an expired signal");
  assert.equal(await page.locator(".bn-signal-card").count(), 0);
  feedStatus = 200;
  await context.close();

  const mobile = await setupContext({ mobile: true });
  await mobile.page.goto(`${mobile.browserOrigin}${signalHref(targetId, sport)}`);
  await waitForTarget(mobile.page);
  assert.equal(await mobile.page.evaluate(() => window.isSecureContext), false, "Manual path is exercised on real insecure HTTP origin");
  const mobileCard = mobile.page.locator(".bn-signal-card").filter({ has: mobile.page.getByRole("heading", { name: targetTitle, exact: true }) });
  await mobileCard.getByRole("button", { name: "Copy link to this signal" }).click();
  const manual = mobileCard.getByRole("textbox", { name: "Direct link to this signal" });
  await manual.waitFor();
  assert.equal(await manual.inputValue(), `${mobile.browserOrigin}${signalHref(targetId, sport)}`);
  await manual.focus();
  assert.equal(await manual.evaluate(input => input.selectionEnd - input.selectionStart), (await manual.inputValue()).length, "Manual link is fully selected for copying");
  await noOverflow(mobile.page, "HTTP manual-copy fallback");
  await mobileCard.getByRole("link", { name: "Open this signal ↗" }).click();
  await waitForTarget(mobile.page);
  await mobile.context.close();
  assert.deepEqual(errors, [], "No browser errors or hydration mismatches");
  assert(apiRequests.length > 0 && apiRequests.every(path => path === "/api/surf-games" || path === "/api/surf-feed"), "Only expected, fully intercepted endpoints were requested");
  console.log("Signal readability UI passed: delayed exact-card fragments, encoded IDs, briefing navigation, filtered/same-fragment jumps, refresh stability, copy success/HTTP fallback, honest unavailable states, both themes, 320/390/1440 widths, accessible top ratings, meaning text and no hydration errors. All API data was intercepted.");
} finally {
  await browser.close();
}
