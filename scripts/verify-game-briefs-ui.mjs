// Synthetic browser fixtures only; intercept every API and external request.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.argv[2] ?? 'http://127.0.0.1:3004';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  for (const sport of ['americanfootball_nfl', 'americanfootball_ncaaf', 'baseball_mlb']) {
    const now = Date.now();
    const game = (id, offset) => ({ id, sport_key: sport, sport_title: 'Offline fixture', home_team: 'New York Yankees', away_team: 'Boston Red Sox', commence_time: new Date(now + offset * 3600000).toISOString(), bookmakers: ['draftkings', 'fanduel', 'fanatics'].map(key => ({ key, title: key, last_update: new Date(now).toISOString(), markets: [{ key: 'spreads', outcomes: [{ name: 'New York Yankees', point: -1.5, price: -110 }, { name: 'Boston Red Sox', point: 1.5, price: -110 }] }] })) });
    const games = [game('later', 48), game('earlier', 24)];
    const context = await browser.newContext();
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        await new Promise(resolve => setTimeout(resolve, 600));
        return route.fulfill({ json: { dataSource: 'demo', dataNotice: 'Offline browser test fixture', sportKey: sport, games, signals: [], predictionMarketConsensus: Object.fromEntries(games.map(g => [g.id, { gameId: g.id, homeTeam: g.home_team, awayTeam: g.away_team, homeProbability: .7, awayProbability: .3, observedAt: now, sources: [{ venue: 'kalshi', label: 'Kalshi', homeProbability: .7, awayProbability: .3, observedAt: now }] }])) } });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/games?sport=${sport}`);
    await page.getByText('Loading', { exact: true }).first().waitFor();
    await page.locator('.bn-game').first().waitFor();
    assert.deepEqual(await page.locator('.bn-game').evaluateAll(cards => cards.map(card => card.dataset.gameId)), ['earlier', 'later']);
    assert.equal(await page.getByRole('combobox', { name: 'Sort games' }).count(), 0);
    assert.equal(await page.locator('.bn-masthead nav a').first().textContent(), 'Spot Stats');
    assert.equal(await page.getByRole('heading', { name: 'Game briefs', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Compare sportsbooks', exact: true }).count(), 2);
    assert.equal(await page.locator('.bn-offer-midpoint').count(), 4);
    assert.equal(await page.locator('.bn-offer-best').count(), 4);
    assert.equal(await page.locator('[aria-label="Surf read on the game"]').count(), 2);
    const reads = await page.locator('[aria-label="Surf read on the game"]').allTextContents();
    assert.equal(reads.some(text => text.includes('priced at 70%')), sport === 'baseball_mlb');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${sport}: overflow at ${width}`);
    }
    await page.getByRole('button', { name: 'Compare sportsbooks', exact: true }).first().click();
    assert.equal(await page.getByRole('button', { name: 'Hide sportsbooks', exact: true }).count(), 1);
    if (sport === 'americanfootball_nfl') await page.screenshot({ path: '/tmp/surf-game-briefs-mobile.png', fullPage: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Game briefs browser checks passed: all three sports, loading, navigation, offer hierarchy, comparison and 1440/390/320px layouts. No providers called.');
} finally { await browser.close(); }
