// Local saved archive only. Block API/external requests; never query providers.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.argv[2] ?? 'http://127.0.0.1:3006';
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ channel:'chrome', headless:true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname.startsWith('/api/') ? route.abort() : route.continue();
  });
  await page.goto(`${origin}/stats/research`);
  assert(await page.locator('[data-spot-card]').count() > 0);
  assert(!(await page.locator('body').innerText()).includes('six or fewer'));
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    const details = page.locator('[data-spot-card] details').first();
    await details.locator('summary').click();
    assert(await details.evaluate(el => el.open));
    await details.getByRole('button',{name:'Close games'}).click();
    assert(!(await details.evaluate(el => el.open)));
    assert(await details.locator('summary').evaluate(el => el === document.activeElement));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  assert.deepEqual(errors, []);
  console.log('Saved-archive Spot Stats desktop/mobile checks passed: no short-rest copy, bottom close restores summary focus, no overflow/runtime errors.');
} finally { await browser.close(); }
