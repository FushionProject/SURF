import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Deliberately local-only: no --hostname override, env-file writes, provider keys,
// production rights flags, or background market-polling process.
if (process.argv.length > 2) throw new Error("This local preview takes no arguments.");
const cwd = fileURLToPath(new URL("..", import.meta.url));
const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
  "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3162"], {
  cwd, stdio: "inherit", env: { ...process.env, NODE_ENV: "development", SURF_SPOT_STATS_LOCAL_PREVIEW: "true" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Could not start the local stats preview."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 0; });
