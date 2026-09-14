import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SPORTS = new Set(["americanfootball_nfl", "americanfootball_ncaaf", "baseball_mlb"]);
const DATA_PATHS = new Set(["/api/surf-games", "/api/surf-feed", "/api/cfb-rankings"]);
const UI_PAGES = new Set(["/", "/games", "/feed", "/top", "/how-to-use", "/account", "/icon.svg"]);
const HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "set-cookie"]);
const UI_HEADERS = new Set(["accept", "accept-language", "accept-encoding", "user-agent", "rsc", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch", "next-url"]);
const EVENT_LINK_TTL = 24 * 60 * 60 * 1000;
const MAX_EVENT_LINK_BYTES = 2 * 1024 * 1024;
const MAX_GAMES_BYTES = 16 * 1024 * 1024;

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function eventLinkKey(sportKey, gameId, bookKey) {
  return JSON.stringify([sportKey, gameId, bookKey]);
}

export function parseEventLinks(value, now = Date.now()) {
  const fail = message => { throw new Error(`Invalid event-links file: ${message}`); };
  if (!exactKeys(value, ["version", "capturedAt", "links"]) || value.version !== 1 || !Array.isArray(value.links)) fail("expected version 1, capturedAt, and links.");
  const capturedAt = typeof value.capturedAt === "string" ? Date.parse(value.capturedAt) : NaN;
  if (!Number.isFinite(capturedAt) || capturedAt > now + 60_000 || now - capturedAt >= EVENT_LINK_TTL) fail("capturedAt must be a valid timestamp within the past 24 hours.");
  if (value.links.length > 10_000) fail("too many links.");
  const links = new Map();
  for (const entry of value.links) {
    if (!exactKeys(entry, ["sportKey", "gameId", "bookKey", "eventLink"])) fail("each entry must contain only sportKey, gameId, bookKey, and eventLink; outcome/betslip metadata is not accepted.");
    if (!SPORTS.has(entry.sportKey)) fail("unsupported sportKey.");
    if (![entry.gameId, entry.bookKey].every(item => typeof item === "string" && item.length > 0 && item.length <= 256 && item.trim() === item)) fail("gameId and bookKey must be nonempty exact identifiers.");
    let url;
    try { url = new URL(entry.eventLink); } catch { fail("eventLink must be an absolute HTTPS URL."); }
    if (typeof entry.eventLink !== "string" || entry.eventLink.length > 8192 || url.protocol !== "https:" || url.username || url.password) fail("eventLink must be an absolute HTTPS URL without credentials.");
    const key = eventLinkKey(entry.sportKey, entry.gameId, entry.bookKey);
    if (links.has(key)) fail("duplicate sport/game/book tuple.");
    links.set(key, entry.eventLink);
  }
  return { capturedAt, links };
}

export async function loadEventLinks(path, now = Date.now()) {
  try {
    if ((await stat(path)).size > MAX_EVENT_LINK_BYTES) throw new Error("file exceeds 2 MB.");
    return parseEventLinks(JSON.parse(await readFile(path, "utf8")), now);
  } catch (error) {
    throw new Error(`Cannot load event-links file: ${error instanceof Error ? error.message : "invalid file"}`);
  }
}

export function overlayEventLinks(payload, sportKey, metadata, now = Date.now()) {
  if (!metadata || now - metadata.capturedAt >= EVENT_LINK_TTL || metadata.capturedAt > now + 60_000
    || payload?.sportKey !== sportKey || !Array.isArray(payload.games)) return payload;
  let changed = false;
  const games = payload.games.map(game => {
    if (game?.sport_key !== sportKey || typeof game.id !== "string" || !Array.isArray(game.bookmakers)) return game;
    let gameChanged = false;
    const bookmakers = game.bookmakers.map(book => {
      // Existing live metadata always wins. Never inspect outcome-level links or
      // infer an event URL from team names, book titles, odds, or a different game.
      if (!book || typeof book.key !== "string" || book.link != null) return book;
      const link = metadata.links.get(eventLinkKey(sportKey, game.id, book.key));
      if (!link) return book;
      gameChanged = changed = true;
      return { ...book, link };
    });
    return gameChanged ? { ...game, bookmakers } : game;
  });
  return changed ? { ...payload, games } : payload;
}

function json(response, status, message) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify({ error: message }));
}

export function localSource(value) {
  const source = new URL(value);
  if (source.protocol !== "http:" || source.hostname !== "127.0.0.1" || source.username || source.password || source.pathname !== "/" || source.search || source.hash) {
    throw new Error("Data source must be a plain http://127.0.0.1:PORT origin.");
  }
  port(source.port || "80");
  return source.origin;
}

export function dataPath(pathname, params) {
  if (!DATA_PATHS.has(pathname)) return undefined;
  if (pathname === "/api/cfb-rankings") return pathname;
  const sport = params.get("sport") || "americanfootball_nfl";
  if (!SPORTS.has(sport)) throw new Error("That sport is not enabled in this preview.");
  // Never forward refresh/debug/force flags, credentials, or arbitrary parameters.
  return `${pathname}?${new URLSearchParams({ sport, refreshMode: "dynamic" })}`;
}

export function previewEnvironment(source = process.env) {
  const result = { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "TZ", "SYSTEMROOT"]) {
    if (source[key]) result[key] = source[key];
  }
  return result;
}

function forward(request, response, origin, path, isData, eventLinks) {
  const headers = isData ? { accept: "application/json" } : Object.fromEntries(
    Object.entries(request.headers).filter(([key]) => UI_HEADERS.has(key)),
  );
  const target = http.request(new URL(path, origin), { method: request.method, headers, timeout: 30_000 }, upstream => {
    if (isData && upstream.statusCode >= 300 && upstream.statusCode < 400) {
      upstream.resume();
      json(response, 502, "Main Surf returned an unexpected data redirect.");
      return;
    }
    const safeHeaders = Object.fromEntries(Object.entries(upstream.headers).filter(([key]) => !HOP_HEADERS.has(key)));
    if (isData) safeHeaders["cache-control"] = "no-store";
    safeHeaders["x-surf-ui-preview"] = "read-only";
    if (eventLinks && isData && new URL(path, origin).pathname === "/api/surf-games" && upstream.statusCode === 200) {
      const chunks = [];
      let length = 0;
      upstream.on("data", chunk => {
        length += chunk.length;
        if (length > MAX_GAMES_BYTES) {
          upstream.destroy();
          json(response, 502, "Main Surf games response exceeded the preview limit.");
        } else chunks.push(chunk);
      });
      upstream.on("error", () => json(response, 502, "Main Surf games response was interrupted."));
      upstream.on("end", () => {
        if (response.destroyed || response.headersSent) return;
        try {
          const raw = Buffer.concat(chunks);
          const payload = JSON.parse(raw.toString("utf8"));
          const enriched = overlayEventLinks(payload, new URL(path, origin).searchParams.get("sport"), eventLinks);
          const body = enriched === payload ? raw : Buffer.from(JSON.stringify(enriched));
          delete safeHeaders.etag;
          delete safeHeaders["content-encoding"];
          safeHeaders["content-length"] = String(body.length);
          response.writeHead(200, safeHeaders);
          response.end(body);
        } catch {
          json(response, 502, "Main Surf returned invalid games data.");
        }
      });
      return;
    }
    response.writeHead(upstream.statusCode || 502, safeHeaders);
    upstream.pipe(response);
    upstream.on("error", () => response.destroy());
  });
  target.on("timeout", () => target.destroy(new Error("Upstream timed out")));
  target.on("error", () => json(response, 503, isData
    ? "Main Surf data is unavailable. Keep the main Surf server running."
    : "The branch preview is starting or unavailable."));
  response.on("close", () => { if (!response.writableEnded) target.destroy(); });
  target.end();
}

export function createPreviewProxy({ sourceOrigin, uiOrigin, root = process.cwd(), eventLinks }) {
  const source = localSource(sourceOrigin);
  const ui = localSource(uiOrigin);
  const publicRoot = resolve(root, "public");
  return http.createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        json(response, 405, "This design preview is read-only. Account and billing changes are disabled.");
        return;
      }
      if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
        json(response, 400, "Invalid preview path.");
        return;
      }
      const url = new URL(request.url, "http://preview.invalid");
      const pathname = decodeURIComponent(url.pathname);
      const path = dataPath(pathname, url.searchParams);
      if (path) {
        if (request.method !== "GET") {
          json(response, 405, "Preview data endpoints accept GET only.");
          return;
        }
        forward(request, response, source, path, true, eventLinks);
        return;
      }
      // Only pages and static files reach Next. API/auth routes never run there,
      // including encoded paths, so public provider APIs cannot form a second collector.
      const publicFile = resolve(publicRoot, `.${pathname}`);
      const isPublic = publicFile.startsWith(publicRoot + sep) && await stat(publicFile).then(value => value.isFile(), () => false);
      const isStatic = pathname.startsWith("/_next/static/") && !pathname.split("/").includes("..");
      if (!UI_PAGES.has(pathname) && !isStatic && !isPublic) {
        json(response, 404, "That route is not available in this read-only design preview.");
        return;
      }
      forward(request, response, ui, url.pathname + url.search, false);
    } catch (error) {
      json(response, 400, error instanceof Error ? error.message : "Invalid preview request.");
    }
  });
}

function port(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535) throw new Error("Ports must be between 1024 and 65535.");
  return Number(value);
}

async function assertFreePort(value, host) {
  const probe = net.createServer();
  await new Promise((yes, no) => probe.once("error", no).listen(value, host, yes));
  await new Promise(yes => probe.close(yes));
}

async function main() {
  const args = process.argv.slice(2);
  const config = { "--port": "3160", "--ui-port": "3161", "--source": "http://127.0.0.1:3158", "--host": "0.0.0.0", "--event-links": undefined };
  if (args.length % 2) throw new Error("Use --port PORT --ui-port PORT --source http://127.0.0.1:PORT --host 0.0.0.0 [--event-links FILE].");
  for (let i = 0; i < args.length; i += 2) {
    if (!(args[i] in config)) throw new Error(`Unknown option: ${args[i]}`);
    config[args[i]] = args[i + 1];
  }
  const publicPort = port(config["--port"]);
  const uiPort = port(config["--ui-port"]);
  const sourceOrigin = localSource(config["--source"]);
  if (new Set([publicPort, uiPort, Number(new URL(sourceOrigin).port)]).size !== 3) throw new Error("Main, UI, and public preview ports must differ.");
  if (!["127.0.0.1", "0.0.0.0"].includes(config["--host"])) throw new Error("Preview host must be 127.0.0.1 or 0.0.0.0.");
  const root = process.cwd();
  const eventLinks = config["--event-links"] ? await loadEventLinks(resolve(config["--event-links"])) : undefined;
  const loadedEnvFiles = [".env", ".env.local", ".env.production", ".env.production.local"];
  if ((await readdir(root)).some(name => loadedEnvFiles.includes(name))) throw new Error("Use a separate worktree with no .env files. Never copy main's API credentials into this preview.");
  await access(resolve(root, ".next/BUILD_ID"));
  await assertFreePort(publicPort, config["--host"]);
  await assertFreePort(uiPort, "127.0.0.1");
  const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(uiPort)], {
    cwd: root, env: previewEnvironment(), stdio: "inherit",
  });
  const server = createPreviewProxy({ sourceOrigin, uiOrigin: `http://127.0.0.1:${uiPort}`, root, eventLinks });
  let closing = false;
  const stop = (code = 0) => {
    if (closing) return;
    closing = true;
    process.exitCode = code;
    server.close();
    server.closeAllConnections();
    child.kill("SIGTERM");
    setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 5000).unref();
  };
  process.on("SIGINT", () => stop());
  process.on("SIGTERM", () => stop());
  child.on("error", error => { console.error(error.message); stop(1); });
  child.on("exit", code => { if (!closing) stop(code || 1); });
  server.on("error", error => { console.error(error.message); stop(1); });
  server.listen(publicPort, config["--host"], () => {
    console.log(`Branch UI: http://localhost:${publicPort} (LAN enabled: ${config["--host"] === "0.0.0.0"}).`);
    console.log(`Data uses the existing main server at ${sourceOrigin}; no independent market collector or API credentials.`);
    if (eventLinks) console.log(`Exact event-link metadata loaded: ${eventLinks.links.size} links, captured ${new Date(eventLinks.capturedAt).toISOString()}; expires after 24 hours without changing quotes or ratings.`);
    console.log("Keep main running. Stop this process to stop only its own preview UI and proxy.");
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Preview not started: ${error.message}`); process.exitCode = 1; });
}
