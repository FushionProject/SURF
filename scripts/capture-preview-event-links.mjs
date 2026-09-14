// One-time preview metadata capture. Never saves keys, prices, trades or betslips.
// Requests one existing h2h odds market per enabled sport, not one call per game.
import { access, readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { SURF_ODDS_API_BOOKMAKER_KEYS } from "../lib/surf/bookmakers.ts";

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--source-env" || args[2] !== "--output") {
  throw new Error("Use --source-env /absolute/path/.env.local --output /absolute/path/event-links.json");
}
const output = resolve(args[3]);
try {
  await access(output);
  throw new Error("Output already exists; no requests made. Choose a new metadata output path.");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const source = await readFile(resolve(args[1]), "utf8");
const line = source.split(/\r?\n/).find(value => /^\s*(?:export\s+)?ODDS_API_KEY\s*=/.test(value));
let apiKey = line?.slice(line.indexOf("=") + 1).trim();
if (apiKey?.startsWith('"') || apiKey?.startsWith("'")) apiKey = apiKey.slice(1, apiKey.indexOf(apiKey[0], 1));
else apiKey = apiKey?.replace(/\s+#.*$/, "").trim();
if (!apiKey || !/^[a-zA-Z0-9_-]+$/.test(apiKey)) throw new Error("A valid ODDS_API_KEY was not found; no requests made.");
const links = [];
for (const sportKey of ["americanfootball_nfl", "americanfootball_ncaaf", "baseball_mlb"]) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);
  url.search = new URLSearchParams({ apiKey, bookmakers: SURF_ODDS_API_BOOKMAKER_KEYS.join(","), markets: "h2h", oddsFormat: "american", includeLinks: "true" });
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error(`Metadata request failed for ${sportKey}; no automatic retries.`); }
  if (!response.ok) throw new Error(`Metadata request returned HTTP ${response.status} for ${sportKey}; no automatic retries.`);
  let games;
  try { games = await response.json(); }
  catch { throw new Error(`Invalid metadata response for ${sportKey}; no automatic retries.`); }
  if (!Array.isArray(games)) throw new Error("Unexpected provider response; metadata was not saved.");
  const counts = {};
  for (const game of games) {
    if (game.sport_key !== sportKey || typeof game.id !== "string") continue;
    for (const book of game.bookmakers ?? []) {
      if (!SURF_ODDS_API_BOOKMAKER_KEYS.includes(book.key) || typeof book.link !== "string") continue;
      let link;
      try { link = new URL(book.link); } catch { continue; }
      if (link.protocol !== "https:" || link.username || link.password) continue;
      links.push({ sportKey, gameId: game.id, bookKey: book.key, eventLink: book.link });
      counts[book.key] = (counts[book.key] ?? 0) + 1;
    }
  }
  console.log(JSON.stringify({ sportKey, eventLinksByBook: counts, requestCredits: response.headers.get("x-requests-last") }));
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), links }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
console.log(`Saved ${links.length} provider event links only. No credentials or odds saved.`);
