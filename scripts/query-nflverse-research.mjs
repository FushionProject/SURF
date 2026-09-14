import { runResearchSpotQuery, validateSpotQuery } from "../lib/spot-stats/engine.ts";
import { loadNflverseResearch } from "../lib/spot-stats/nflverse-store.ts";

const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
  console.log("Usage: npm run stats:research -- --team PIT --from 2020 --to 2025 [--week 1] [--venue home|away|neutral] [--role favorite|underdog|pickem] [--postseason] [--rows]\nLocal descriptive research only. No requests or public output endpoints. Historical lines are not verified bookmaker closing quotes. Relocated franchises retain separate team codes.");
} else {
  try {
    const flags = new Set(["--postseason", "--rows"]);
    const valued = new Set(["--team", "--from", "--to", "--week", "--venue", "--role"]);
    const options = new Map();
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if ((!flags.has(arg) && !valued.has(arg)) || options.has(arg)) throw new Error("Unsupported argument");
      if (flags.has(arg)) options.set(arg, true);
      else {
        const value = args[++i];
        if (!value || value.startsWith("--")) throw new Error("Missing value");
        options.set(arg, value);
      }
    }
    for (const key of ["--team", "--from", "--to"]) if (!options.has(key)) throw new Error("Missing argument");
    for (const key of ["--from", "--to", "--week"]) {
      if (options.has(key) && !/^\d+$/.test(options.get(key))) throw new Error("Invalid integer");
    }
    // Validate arguments before reading local source data.
    const query = validateSpotQuery({
      team: options.get("--team"), seasonFrom: Number(options.get("--from")), seasonTo: Number(options.get("--to")),
      seasonTypes: options.has("--postseason") ? [3] : [1], cutoffAt: new Date().toISOString(),
      includeTotals: true,
      ...(options.has("--week") ? { week: Number(options.get("--week")) } : {}),
      ...(options.has("--venue") ? { venue: options.get("--venue") } : {}),
      ...(options.has("--role") ? { role: options.get("--role") } : {}),
    });
    const imported = await loadNflverseResearch();
    const result = runResearchSpotQuery(imported.report.games, { ...query, cutoffAt: imported.retrievedAt });
    const { rows, ...summary } = result;
    console.log(JSON.stringify({
      purpose: "private-research-only", sourceSha256: imported.sha256, archiveSha256: imported.archiveSha256, sourceRetrievedAt: imported.retrievedAt,
      attribution: imported.attribution, importRejections: imported.report.reasons,
      ...summary,
      ...(options.has("--rows") ? { rows } : { matchedGameIds: rows.map((row) => row.gameId) }),
    }, null, 2));
  } catch {
    console.error("Research query unavailable. Check the arguments and run the private NFL import first. Use --help for examples.");
    process.exitCode = 1;
  }
}
