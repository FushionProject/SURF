// Read-only browser checks: never submits credentials or starts checkout.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const origin = process.argv[2];
assert(origin && ["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Local preview required");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/account?confirmation=failed`);
  await page.locator('input[type="email"]').waitFor();
  assert.equal(await page.getByRole("alert").filter({ hasText: "That confirmation link could not be verified" }).count(), 1);
  await page.getByRole("button", { name: "Create account", exact: true }).first().click();
  assert.equal(await page.locator('input[type="password"]').getAttribute("minlength"), "8");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  assert.equal(await page.locator('input[type="password"]').getAttribute("minlength"), null);
  for (const route of ["account", "how-to-use"]) {
    await page.goto(`${origin}/${route}`);
    for (const theme of ["light", "dark"]) {
      await page.getByRole("combobox", { name: "Color theme" }).selectOption(theme);
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        const style = await page.evaluate(() => {
          const root = document.querySelector(".bn-secondary-page");
          const h1 = document.querySelector("h1");
          const rgb = color => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          return { background: rgb(getComputedStyle(root).backgroundColor), ink: rgb(getComputedStyle(h1).color), width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
        });
        const luminance = rgb => rgb.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
        const a = luminance(style.background), b = luminance(style.ink);
        assert((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${route} ${theme}: heading contrast`);
        assert(style.scroll <= style.width + 1, `${route} ${theme} ${width}: overflow`);
        if (width === 390 && process.env.SURF_UI_SCREENSHOT) await page.screenshot({ path: `${process.env.SURF_UI_SCREENSHOT}-${route}-${theme}.png`, fullPage: true });
      }
    }
  }
  const response = await fetch(`${origin}/api/billing/status`);
  assert.equal(response.status, 401, "Anonymous billing denied");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(errors, [], "Browser errors including hydration");
  console.log("Account/guide passed: connected form, confirmation errors, sign-in/signup controls, two-theme contrast, three widths, no hydration errors, private billing response. No accounts or payments created.");
} finally { await browser.close(); }
