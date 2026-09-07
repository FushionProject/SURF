import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const allowedSports = new Set([
  "americanfootball_nfl",
  "americanfootball_ncaaf",
  "baseball_mlb",
]);

function argument(name) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function printReport(report) {
  const icon = { pass: "PASS", warn: "WARN", fail: "FAIL" };
  console.log(`\nROPE — ${report.name}`);
  console.log(`${report.status} · ${report.score}/100 · ${report.sportKey}`);
  console.log(`${report.summary.games} games · ${report.summary.signals} signals · ${report.summary.arbitrages} arbs`);
  console.log(`${report.summary.minimumBooksPerGame}-${report.summary.maximumBooksPerGame} books per game`);
  for (const item of report.checks) {
    console.log(`[${icon[item.status]}] ${item.label}: ${item.summary}`);
    for (const detail of item.details) console.log(`  - ${detail}`);
  }
  if (report.releaseBlockers.length > 0) {
    console.log("\nRELEASE BLOCKERS");
    for (const blocker of report.releaseBlockers) console.log(`- ${blocker}`);
  }
  if (report.warnings.length > 0) {
    console.log("\nWARNINGS");
    for (const warning of report.warnings) console.log(`- ${warning}`);
  }
}

async function main() {
  const sport = argument("--sport");
  if (!sport || !allowedSports.has(sport)) {
    throw new Error(`Pass exactly one --sport value: ${[...allowedSports].join(", ")}. ROPE never polls every sport accidentally.`);
  }
  const token = process.env.ROPE_AUDIT_TOKEN;
  if (!token || token.length < 24) throw new Error("ROPE_AUDIT_TOKEN must contain at least 24 characters.");
  const baseUrl = (argument("--base-url") ?? process.env.ROPE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const noTrigger = process.argv.includes("--no-trigger");
  const json = process.argv.includes("--json");

  if (!noTrigger) {
    const feedResponse = await fetch(`${baseUrl}/api/surf-feed?sport=${encodeURIComponent(sport)}&refreshMode=manual`, {
      headers: { accept: "application/json" },
    });
    if (!feedResponse.ok) throw new Error(`Surf feed examination failed (${feedResponse.status}).`);
  }

  const reportResponse = await fetch(`${baseUrl}/api/internal/rope?sport=${encodeURIComponent(sport)}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  if (!reportResponse.ok) throw new Error(`Private ROPE report failed (${reportResponse.status}).`);
  const payload = await reportResponse.json();
  const report = payload.reports?.[sport]?.at(-1);
  if (!report) throw new Error("ROPE did not return a report for the requested sport.");

  if (json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  process.exitCode = report.status === "PASS" ? 0 : 2;
}

main().catch((error) => {
  console.error(`ROPE could not complete: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
