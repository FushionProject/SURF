import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
// Explicitly reviewed fixture-based suites. Never automatically discover import,
// audit, preview, UI capture, provider, deployment, or newly added test scripts.
const suites = [
  'test:persistence', 'test:market-tape', 'test:market-horizon',
  'test:opportunities', 'test:bookmakers', 'test:prediction-markets',
  'test:market-clarity', 'test:feed-schedule', 'test:signal-feed',
  'test:sport-gating', 'test:cfb', 'test:cfb-postgres', 'test:auth-redirect',
  'test:layout-parity', 'test:billing', 'test:dynamic-ratings',
  'test:signal-readability', 'test:sportsbook-links',
  'test:spot-stats', 'test:spot-stats:api-sports', 'test:spot-stats:nflverse',
  'test:spot-stats:preview', 'test:spot-stats:feed',
];
// Do not inherit API credentials or public environment values from a developer shell.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SystemRoot'].flatMap(
  key => process.env[key] ? [[key, process.env[key]]] : [],
));
Object.assign(env, {
  CI: 'true', NEXT_TELEMETRY_DISABLED: '1',
  NODE_OPTIONS: `--require=${resolve('scripts/ci/no-network.cjs')}`,
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: resolve('scripts/ci/offline-fonts.cjs'),
});
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  try { readFileSync(name); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  throw new Error(`Remove ${name} from this isolated checkout before offline CI`);
}
const commands = [
  ...suites.filter(name => Object.hasOwn(scripts, name)).map(name => ['run', name]),
  ['run', 'lint'],
  ['run', 'build', '--', '--webpack'],
];
for (const args of commands) {
  console.log(`\n> npm ${args.join(' ')}`);
  const result = spawnSync('npm', args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
