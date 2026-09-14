import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Offline fixtures only: deliberately excludes imports, live ROPE polling,
// browser tools, and previews requiring a private research archive.
const suites = [
  "test:rope", "test:persistence-reliability", "test:supabase-schema",
  "test:market-history", "test:market-tape", "test:market-horizon",
  "test:opportunities", "test:bookmakers", "test:prediction-markets",
  "test:market-clarity", "test:feed-schedule", "test:signal-feed",
  "test:dynamic-ratings", "test:layout-parity", "test:sport-gating",
  "test:cfb", "test:cfb-postgres", "test:auth-redirect", "test:billing",
  "test:paid-access", "test:spot-stats:preview", "test:spot-stats:feed",
  "test:spot-stats:api-sports", "test:spot-stats:nflverse", "test:spot-stats",
];
for (const suite of suites) {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", suite], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit", timeout: 120_000,
  });
  if (result.status !== 0) {
    console.error(`Release regression failed: ${suite}`);
    process.exit(result.status ?? 1);
  }
}
console.log(`All ${suites.length} offline release suites passed. This does not certify live billing, production storage, or provider availability.`);
