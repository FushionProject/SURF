// Offline browser checks: synthetic API payloads only. External navigation is
// fulfilled locally, so this test never contacts a book or submits a wager.
import assert from "node:assert/strict";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const origin = process.argv[2] ?? "http://localhost:3160";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use a local preview origin");
const sport = "americanfootball_nfl";
const now = Date.now();
const kickoff = new Date(now + 24 * 60 * 60 * 1000).toISOString();
const checkedAt = new Date(now).toISOString();
const books = [
  ["draftkings", "DraftKings"], ["fanduel", "FanDuel"],
  ["williamhill_us", "Caesars"], ["betmgm", "BetMGM"],
  ["betrivers", "BetRivers"], ["fanatics", "Fanatics"],
  ["hardrockbet", "Hard Rock Bet"], ["ballybet", "Bally Bet"],
];
function gameFixture(id, away, home, eventNumber) {
  const links = {
    draftkings: `https://sportsbook.draftkings.com/event/${eventNumber}`,
    fanduel: `https://sportsbook.fanduel.com/football/nfl/${eventNumber}`,
    williamhill_us: `https://sportsbook.caesars.com/us/{state}/bet/events/${eventNumber}`,
    betmgm: `https://sports.{state}.betmgm.com/en/sports/events/${eventNumber}`,
    betrivers: `https://{state}.betrivers.com/?eventId=${eventNumber}`,
  };
  return {
    id, sport_key: sport, sport_title: "NFL", commence_time: kickoff,
    away_team: away, home_team: home,
    bookmakers: books.map(([key, title]) => ({
      key, title, link: links[key], last_update: checkedAt,
      markets: [
        { key: "spreads", last_update: checkedAt, outcomes: [
          { name: away, point: key === "draftkings" ? 3.5 : 3, price: -110 },
          { name: home, point: key === "fanduel" ? -2.5 : -3, price: -110 },
        ] },
        { key: "h2h", last_update: checkedAt, outcomes: [{ name: away, price: 150 }, { name: home, price: -145 }] },
        { key: "totals", last_update: checkedAt, outcomes: [{ name: "Over", point: 45.5, price: -110 }, { name: "Under", point: 45.5, price: -110 }] },
      ],
    })),
  };
}
const firstGame = gameFixture("offline-links-game-a", "Dallas Cowboys", "New York Giants", "1234567");
const secondGame = gameFixture("offline-links-game-b", "Buffalo Bills", "Houston Texans", "7654321");
secondGame.bookmakers.find(book => book.key === "betmgm").link = "https://sportsbook.fanduel.com/football/nfl/7654321";
secondGame.bookmakers.find(book => book.key === "hardrockbet").link = "https://app.hardrock.bet/betslip?selection=1234567";
secondGame.bookmakers.find(book => book.key === "ballybet").link = "javascript:alert('unsafe-link')";
secondGame.bookmakers.find(book => book.key === "fanatics").markets[0].outcomes[0].link = "https://sportsbook.fanatics.com/event/7654321?selection=1234";
const games = [firstGame, secondGame];

function baseSignal(id, game, title) {
  return {
    id, title, game: { id: game.id, sportKey: sport, sportLabel: "NFL", league: "NFL", awayTeam: game.away_team, homeTeam: game.home_team },
    commenceTime: kickoff, signalType: "Best Number", market: "spreads",
    strengthScore: 86, detectedAt: now, lastSeenAt: now,
  };
}
function quoteSignal(id, game, book, title = id) {
  return { ...baseSignal(id, game, title), opportunity: {
    kind: "best_line", selection: game.away_team, bookTitle: book,
    point: 3.5, price: -110, consensusPoint: 2.5, booksCompared: 8,
    lineEdge: 1, reason: "Offline source comparison", score: 86,
  } };
}
const signals = [
  quoteSignal("plain", firstGame, "DraftKings", "Offline best number"),
  {
    ...baseSignal("middle", firstGame, "Offline two-book middle"),
    opportunity: { kind: "best_line", isMiddle: true, middleWidth: 1, middleOutsideCostPercentage: 4.55, selection: firstGame.away_team, bookTitle: "DraftKings", booksCompared: 8 },
    valueOptions: [{ selection: firstGame.away_team, book: "DraftKings", line: "+3.5", price: "-110" }, { selection: firstGame.home_team, book: "FanDuel", line: "-2.5", price: "-110" }],
  },
  {
    ...baseSignal("arb", secondGame, "Offline two-book arbitrage"), market: "h2h", signalType: "Arbitrage",
    opportunity: { kind: "arbitrage", selection: secondGame.away_team, bookTitle: "DraftKings", booksCompared: 8, arbitrage: {
      combinedImpliedProbability: 0.99, estimatedReturnPercentage: 1,
      legs: [{ selection: secondGame.away_team, bookTitle: "DraftKings", price: 150 }, { selection: secondGame.home_team, bookTitle: "FanDuel", price: -145 }],
    } },
  },
  quoteSignal("caesars", firstGame, "Caesars", "Offline Caesars state link"),
  quoteSignal("mgm", firstGame, "BetMGM", "Offline MGM state link"),
  quoteSignal("rivers", firstGame, "BetRivers", "Offline Rivers state link"),
  quoteSignal("missing", secondGame, "Fanatics", "Offline missing event link"),
  quoteSignal("wrong-host", secondGame, "BetMGM", "Offline mismatched book host"),
  quoteSignal("betslip", secondGame, "Hard Rock Bet", "Offline betslip rejected"),
  quoteSignal("unsafe", secondGame, "Bally Bet", "Offline unsafe scheme rejected"),
  quoteSignal("missing-game", { ...firstGame, id: "game-not-on-board" }, "DraftKings", "Offline missing game rejected"),
  { ...quoteSignal("cross-sport", firstGame, "DraftKings", "Offline wrong sport rejected"), game: { ...baseSignal("unused", firstGame, "unused").game, sportKey: "baseball_mlb" } },
  ...["kalshi", "polymarket"].map(venue => ({
    ...baseSignal(venue, firstGame, `Offline ${venue} executed purchase`), signalType: "Whale Activity",
    whaleActivity: { venue, venueLabel: venue === "kalshi" ? "Kalshi" : "Polymarket", activityKind: "large_trade", isAnonymous: venue === "kalshi", participantLabel: "0xTEST", committedUsd: 25000, contracts: 50000, averagePrice: 0.5, tradeCount: 1, occurredAt: now - 5000, outcomeTeam: firstGame.away_team, sourceUrl: venue === "kalshi" ? "https://kalshi.com/markets/offline-game" : "https://polymarket.com/event/offline-game" },
  })),
];
const gamePayload = { sportKey: sport, dataSource: "demo", dataNotice: "Offline sportsbook link regression fixtures", games };
const feedPayload = { sportKey: sport, dataSource: "demo", dataNotice: "Offline sportsbook link regression fixtures", signals };
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Chicago" });
  const apiRequests = [];
  const outboundNavigations = [];
  const unexpectedExternalRequests = [];
  const allowedDestinations = new Set([
    "https://sportsbook.draftkings.com/event/1234567",
    "https://sportsbook.fanduel.com/football/nfl/1234567",
    "https://sportsbook.draftkings.com/event/7654321",
    "https://sportsbook.fanduel.com/football/nfl/7654321",
    "https://polymarket.com/event/offline-game",
  ]);
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(origin).origin) {
      if (request.isNavigationRequest()) {
        outboundNavigations.push(request.url());
        if (!allowedDestinations.has(request.url())) unexpectedExternalRequests.push(request.url());
        return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Offline destination</title><p>Intercepted; no sportsbook request was sent.</p>" });
      }
      return route.abort(); // External logos are unnecessary for these checks.
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    apiRequests.push(url.pathname);
    if (url.pathname === "/api/surf-games") return route.fulfill({ json: gamePayload });
    if (url.pathname === "/api/surf-feed") return route.fulfill({ json: feedPayload });
    return route.fulfill({ status: 503, json: { error: "Offline test: endpoint not available" } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|hydrating|server rendered/i.test(message.text())) errors.push(message.text());
  });
  const signalCard = title => page.locator(".bn-signal-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  const bookLink = (container, name) => container.locator("a.bn-book-link").filter({ hasText: name });
  async function assertLink(link, expected) {
    await link.waitFor({ state: "attached" });
    assert.equal(await link.count(), 1, `Expected one book link: ${expected}`);
    assert.equal(await link.getAttribute("href"), expected);
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.match(await link.getAttribute("rel"), /\bnoopener\b/);
    assert.match(await link.getAttribute("rel"), /\bnoreferrer\b/);
  }
  async function noOverflow(label) {
    const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert(sizes.scroll <= sizes.width + 1, `${label}: page overflow ${JSON.stringify(sizes)}`);
  }
  async function clickOffline(link, expected) {
    allowedDestinations.add(expected);
    const popupPromise = context.waitForEvent("page");
    await link.click();
    const popup = await popupPromise;
    await popup.waitForURL(expected);
    await popup.waitForLoadState("domcontentloaded");
    assert.equal(popup.url(), expected);
    assert.equal(await popup.evaluate(() => window.opener), null, "New tab must not gain access to Surf.");
    await popup.getByText("Intercepted; no sportsbook request was sent.", { exact: true }).waitFor();
    await popup.close();
  }

  await page.goto(`${origin}/feed?sport=${sport}`);
  await signalCard("Offline best number").waitFor();
  await assertLink(bookLink(signalCard("Offline best number"), "DraftKings"), "https://sportsbook.draftkings.com/event/1234567");
  assert.equal(await signalCard("Offline best number").getByRole("link", { name: /8 books/ }).count(), 0, "Market median is not a sportsbook and must not be clickable.");

  const middle = signalCard("Offline two-book middle");
  await assertLink(bookLink(middle, "DraftKings"), "https://sportsbook.draftkings.com/event/1234567");
  await assertLink(bookLink(middle, "FanDuel"), "https://sportsbook.fanduel.com/football/nfl/1234567");
  const arb = signalCard("Offline two-book arbitrage");
  await assertLink(bookLink(arb, "DraftKings"), "https://sportsbook.draftkings.com/event/7654321");
  await assertLink(bookLink(arb, "FanDuel"), "https://sportsbook.fanduel.com/football/nfl/7654321");
  await clickOffline(bookLink(middle, "DraftKings"), "https://sportsbook.draftkings.com/event/1234567");
  await clickOffline(bookLink(arb, "FanDuel"), "https://sportsbook.fanduel.com/football/nfl/7654321");

  for (const title of ["Offline Caesars state link", "Offline MGM state link", "Offline Rivers state link", "Offline missing event link", "Offline mismatched book host", "Offline betslip rejected", "Offline unsafe scheme rejected", "Offline missing game rejected", "Offline wrong sport rejected"]) {
    assert.equal(await signalCard(title).locator("a.bn-book-link").count(), 0, `${title}: unavailable or unsafe destinations must stay plain text.`);
  }
  const kalshi = signalCard("Offline kalshi executed purchase");
  assert.equal(await kalshi.locator('a[href*="kalshi.com"]').count(), 0, "Remove broken Kalshi trade/market navigation only.");
  assert.equal(await kalshi.getByRole("link", { name: /view.*(?:trade|market)/i }).count(), 0);
  await kalshi.getByText("$25,000", { exact: true }).waitFor();
  await kalshi.getByText("50¢", { exact: true }).waitFor();
  const poly = signalCard("Offline polymarket executed purchase");
  const polyLink = poly.getByRole("link", { name: /View market/ });
  await assertLink(polyLink, "https://polymarket.com/event/offline-game");

  const stateSelect = page.getByRole("combobox", { name: "Sportsbook state", exact: true });
  await stateSelect.selectOption("ny");
  const stateCases = [
    ["Offline Caesars state link", "Caesars", "https://sportsbook.caesars.com/us/ny/bet/events/1234567"],
    ["Offline MGM state link", "BetMGM", "https://sports.ny.betmgm.com/en/sports/events/1234567"],
    ["Offline Rivers state link", "BetRivers", "https://ny.betrivers.com/?eventId=1234567"],
  ];
  for (const [title, book, href] of stateCases) {
    await assertLink(bookLink(signalCard(title), book), href);
    await clickOffline(bookLink(signalCard(title), book), href);
  }
  for (const title of ["Offline missing event link", "Offline mismatched book host", "Offline betslip rejected", "Offline unsafe scheme rejected", "Offline missing game rejected", "Offline wrong sport rejected"]) {
    assert.equal(await signalCard(title).locator("a.bn-book-link").count(), 0, `${title}: selecting state must not relax exact-game or URL validation.`);
  }
  await page.reload();
  await signalCard("Offline best number").waitFor();
  for (const [title, book, href] of stateCases) await assertLink(bookLink(signalCard(title), book), href);
  assert.equal(await stateSelect.inputValue(), "ny", "Explicit state choice survives reload.");
  await stateSelect.selectOption("");
  await signalCard("Offline Caesars state link").locator("a.bn-book-link").waitFor({ state: "detached" });
  for (const [title] of stateCases) assert.equal(await signalCard(title).locator("a.bn-book-link").count(), 0, "Clearing state disables template links again.");
  await stateSelect.selectOption("ny");

  for (const theme of ["dark", "light"]) {
    await page.evaluate(value => document.documentElement.dataset.surfMode = value, theme);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(`Signals ${theme} ${width}`);
      assert(await stateSelect.isVisible(), "State selector remains visible on mobile.");
      await assertLink(bookLink(signalCard("Offline two-book middle"), "FanDuel"), "https://sportsbook.fanduel.com/football/nfl/1234567");
    }
  }

  await page.goto(`${origin}/games?sport=${sport}`);
  await page.locator(".bn-game").first().waitFor();
  const firstCard = page.locator(".bn-game").filter({ hasText: "Dallas Cowboys" });
  await assertLink(bookLink(firstCard.locator(".bn-offer"), "DraftKings"), "https://sportsbook.draftkings.com/event/1234567");
  await assertLink(bookLink(firstCard.locator(".bn-offer"), "FanDuel"), "https://sportsbook.fanduel.com/football/nfl/1234567");
  await firstCard.getByRole("button", { name: /^Compare all sportsbook quotes/ }).click();
  const table = firstCard.locator("table");
  for (const [, book, href] of stateCases) await assertLink(bookLink(table, book), href);
  await assertLink(bookLink(table, "DraftKings"), "https://sportsbook.draftkings.com/event/1234567");
  assert.equal(await table.locator("a.bn-book-link").filter({ hasText: "Fanatics" }).count(), 0);
  assert.match(await table.innerText(), /Fanatics/, "Missing links must not remove the quote or sportsbook label.");
  const secondCard = page.locator(".bn-game").filter({ hasText: "Buffalo Bills" });
  await secondCard.getByRole("button", { name: /^Compare all sportsbook quotes/ }).click();
  await assertLink(bookLink(secondCard.locator("table"), "DraftKings"), "https://sportsbook.draftkings.com/event/7654321");
  for (const book of ["BetMGM", "Fanatics", "Hard Rock Bet", "Bally Bet"]) assert.equal(await bookLink(secondCard.locator("table"), book).count(), 0, `${book}: unsafe/missing event link stays unlinked in Games too.`);
  for (const theme of ["dark", "light"]) {
    await page.evaluate(value => document.documentElement.dataset.surfMode = value, theme);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(`Games ${theme} ${width}`);
    }
  }
  const deniedStoragePage = await context.newPage();
  deniedStoragePage.on("pageerror", error => errors.push(error.message));
  await deniedStoragePage.addInitScript(() => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "surf:sportsbook-state") throw new DOMException("Storage denied by offline test", "SecurityError");
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "surf:sportsbook-state") throw new DOMException("Storage denied by offline test", "SecurityError");
      return originalSet.call(this, key, value);
    };
  });
  await deniedStoragePage.goto(`${origin}/feed?sport=${sport}`);
  const deniedCard = deniedStoragePage.locator(".bn-signal-card").filter({ has: deniedStoragePage.getByRole("heading", { name: "Offline Caesars state link", exact: true }) });
  await deniedCard.waitFor();
  assert.equal(await deniedCard.locator("a.bn-book-link").count(), 0, "Denied state storage must not guess a state or break rendering.");
  await deniedStoragePage.getByRole("combobox", { name: "Sportsbook state", exact: true }).selectOption("ny");
  await assertLink(bookLink(deniedCard, "Caesars"), stateCases[0][2]);
  await deniedStoragePage.close();
  assert.deepEqual(errors, [], "No browser exceptions or hydration errors.");
  assert.deepEqual(unexpectedExternalRequests, [], "Only tested game destinations may be opened; all are intercepted locally.");
  assert.equal(outboundNavigations.length, 5, "Actual link clicks opened five intercepted event pages.");
  assert(apiRequests.length >= 2 && apiRequests.every(path => path === "/api/surf-games" || path === "/api/surf-feed"), "All API responses were synthetic and intercepted.");
  console.log("Offline sportsbook-link UI passed: exact game/book links, both middle/arbitrage legs, direct new-tab navigation, explicit persisted state, median/missing/unsafe links, Kalshi removal with retained trades, Polymarket preservation, Games offers/table, and mobile themes. No provider or sportsbook requests sent.");
} finally {
  await browser.close();
}
