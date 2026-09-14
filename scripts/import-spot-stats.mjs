import nextEnv from "@next/env";
import { readSpotStatsConfig } from "../lib/spot-stats/config.ts";
import { fetchSportsDataIOSeason } from "../lib/spot-stats/provider.ts";
import { saveSpotStatsSnapshot } from "../lib/spot-stats/store.ts";

const HELP = `Usage: npm run stats:import -- --season 2025REG [--fetch]

One explicit season per run (YYYYREG or YYYYPOST). Without --fetch, no network
requests or file writes occur. --fetch makes one SportsDataIO request, no retries.
Reads server-only configuration from this checkout's .env.local.
Trial imports stay quarantined and never become customer statistics.
Licensed mode requires a separate confirmation of storage/derived-display rights.
See docs/spot-stats.md. Never pass an API key as a command-line argument.`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) { console.log(HELP); return; }
  let seasonToken;
  let execute = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--season" && !seasonToken) seasonToken = args[++i];
    else if (args[i] === "--fetch" && !execute) execute = true;
    else throw new Error("Invalid arguments. Use --help; API keys must stay in private environment variables.");
  }
  const match = /^(19\d{2}|20\d{2})(REG|POST)$/.exec(seasonToken ?? "");
  if (!match) throw new Error("Choose one NFL season, for example --season 2025REG.");
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const config = readSpotStatsConfig();
  console.log(`NFL ${seasonToken} · mode: ${config.mode} · requests planned: ${execute ? 1 : 0}`);
  if (!execute) { console.log("Dry run only. Add --fetch when access and the requested season are ready."); return; }
  const envelope = await fetchSportsDataIOSeason({ season: Number(match[1]), seasonType: match[2] === "REG" ? 1 : 3, config });
  const saved = await saveSpotStatsSnapshot(envelope);
  console.log(`Imported ${saved.report.games.length} completed games; rejected ${saved.report.rejected}; duplicates ${saved.report.duplicates}.`);
  console.log(config.mode === "trial" ? "Trial snapshot quarantined. No factual trends published." : "Licensed snapshot staged for the Stats workspace. No automatic Signals publishing.");
  console.log(`Snapshot: ${saved.path}`);
}

main().catch(() => {
  // Never echo provider responses, supplied arguments, or keys on error.
  console.error("Stats import did not complete. Check mode, credentials, season entitlement, and provider availability. Existing snapshots were preserved. Use --help for setup.");
  process.exitCode = 1;
});
