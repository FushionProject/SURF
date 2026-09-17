// Offline browser smoke audit. All API requests are intercepted; no credentials,
// provider requests, account submissions, payments, or external links are used.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.argv[2] ?? 'http://127.0.0.1:3002';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const results = [];
try {
  const context = await browser.newContext();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Offline browser audit: provider unavailable', games: [], signals: [] } });
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const route of ['/', '/feed', '/top', '/how-to-use', '/account', '/stats', '/games?sport=baseball_mlb', '/games?sport=americanfootball_ncaaf']) {
    await page.goto(origin + route);
    await page.waitForTimeout(1000);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert(dimensions.scroll <= dimensions.width + 1, `${route} overflow ${JSON.stringify(dimensions)}`);
    }
    const brokenLinks = await page.locator('a').evaluateAll(links => links.filter(link => !link.getAttribute('href') || link.getAttribute('href') === '#').map(link => link.textContent));
    assert.deepEqual(brokenLinks, [], `${route}: placeholder links`);
    assert.equal(await page.getByRole('button', { name: /copy.*link/i }).count(), 0, `${route}: no removed copy control`);
    assert.equal(await page.locator('a[href*="polymarket.com"], a[href*="kalshi.com"]').count(), 0, `${route}: no prediction-market links`);
    results.push({ route, destination: new URL(page.url()).pathname, title: await page.locator('h1').allTextContents(), brokenLinks });
    if (route === '/how-to-use') {
      const details = page.locator('details');
      for (let i = 0; i < await details.count(); i++) await details.nth(i).locator('summary').click();
    }
    if (route === '/feed') assert.equal(await page.getByRole('heading', { name: 'Market activity unavailable.' }).count(), 1);
    if (route === '/') assert.equal(new URL(page.url()).pathname, '/stats');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/games?sport=americanfootball_nfl');
  await page.locator('.bn-masthead').getByRole('link', { name: 'Trends', exact: true }).click();
  await page.waitForURL('**/stats?sport=americanfootball_nfl');
  assert.equal(await page.getByRole('heading', { name: '404', exact: true }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Trends', exact: true }).count(), 1);
  console.log(JSON.stringify({ results, errors }, null, 2));
  assert.deepEqual(errors, [], 'Runtime/hydration errors');
} finally { await browser.close(); }
