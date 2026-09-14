import { runApiSportsResearchQuery, validateSpotQuery } from "../lib/spot-stats/engine.ts";
import { API_SPORTS_RESEARCH_NOTICE, loadApiSportsResearch } from "../lib/spot-stats/api-sports-store.ts";

const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
  console.log("Usage: npm run stats:research:api-sports -- --team PIT --from 2010 --to 2025 [--week 1] [--postseason] [--rows]\nPrivate local straight-up research only. No network requests. Spreads, totals, historical coach tenure, and confirmed neutral venues are unavailable; no ATS, favorite, or venue filters are inferred. Relocated franchises retain separate team codes.");
} else {
  try {
    const flags = new Set(["--postseason", "--rows"]);
    const valued = new Set(["--team", "--from", "--to", "--week"]);
    const options = new Map();
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if ((!flags.has(arg) && !valued.has(arg)) || options.has(arg)) throw new Error("Unsupported argument");
      if (flags.has(arg)) options.set(arg, true);
      else {
        const value = args[++index];
        if (!value || value.startsWith("--")) throw new Error("Missing value");
        options.set(arg, value);
      }
    }
    for (const key of ["--team", "--from", "--to"]) if (!options.has(key)) throw new Error("Missing argument");
    for (const key of ["--from", "--to", "--week"]) {
      if (options.has(key) && !/^\d+$/.test(options.get(key))) throw new Error("Invalid integer");
    }
    // No local archive is read until the complete, fixed filter set is valid.
    const query = validateSpotQuery({
      team: options.get("--team"), seasonFrom: Number(options.get("--from")), seasonTo: Number(options.get("--to")),
      seasonTypes: options.has("--postseason") ? [3] : [1], cutoffAt: new Date().toISOString(),
      includeTotals: true,
      ...(options.has("--week") ? { week: Number(options.get("--week")) } : {}),
    });
    const imported = await loadApiSportsResearch();
    if (!imported.imports.length || imported.invalidFiles > 0) {
      throw new Error("Missing or invalid private research archive");
    }
    const requestedSeasons = Array.from({ length: query.seasonTo - query.seasonFrom + 1 }, (_, index) => query.seasonFrom + index);
    const selectedImports = imported.imports.filter((item) => item.season >= query.seasonFrom && item.season <= query.seasonTo);
    const importedSeasons = new Set(selectedImports.map((item) => item.season));
    const usableSeasons = new Set(selectedImports.filter((item) => item.report.games.some((game) => query.seasonTypes.includes(game.seasonType))).map((item) => item.season));
    const result = runApiSportsResearchQuery(imported.games, query);
    const { rows, ...summary } = result;
    console.log(JSON.stringify({
      purpose: "private-research-only",
      provider: "api-sports",
      publicationRights: "unconfirmed",
      notice: API_SPORTS_RESEARCH_NOTICE,
      coverage: {
        requestedSeasons,
        importedSeasons: [...importedSeasons].sort((a, b) => a - b),
        seasonsWithUsableGames: [...usableSeasons].sort((a, b) => a - b),
        missingRequestedSeasons: requestedSeasons.filter((season) => !importedSeasons.has(season)),
        importedWithoutUsableGames: [...importedSeasons].filter((season) => !usableSeasons.has(season)).sort((a, b) => a - b),
        fullSeasonCompletenessVerified: false,
        note: "Results cover accepted records only, not a verified complete history. Imported seasons with missing stage/week may remain raw-only. Usable-season counts refer to the requested regular/postseason type before team/week filtering.",
      },
      sources: selectedImports.map((item) => ({
        season: item.season,
        retrievedAt: item.retrievedAt,
        sourceSha256: item.sha256,
        archiveSha256: item.archiveSha256,
        acceptedGames: item.report.games.length,
        acceptedGamesForRequestedSeasonType: item.report.games.filter((game) => query.seasonTypes.includes(game.seasonType)).length,
        receivedRows: item.report.received,
        importRejections: item.report.reasons,
        unclassified: item.report.unclassified,
        intentionallyExcluded: item.report.excluded,
      })),
      ...summary,
      ...(options.has("--rows") ? { rows } : { matchedGameIds: rows.map((row) => row.gameId) }),
    }, null, 2));
  } catch {
    console.error("API-Sports research query unavailable. Check the arguments and private season archives. Use --help for supported filters. No API requests were made.");
    process.exitCode = 1;
  }
}
