import type { OddsApiGame } from "./types";
import { sportsbookStateCode } from "./usStates.ts";
export { isSportsbookState } from "./usStates.ts";

type Sportsbook = "draftkings" | "fanduel" | "betmgm" | "caesars" | "fanatics" | "betrivers" | "thescore" | "hardrock" | "bally";

const BOOK_ALIASES: Record<string, Sportsbook> = {
  draftkings: "draftkings",
  fanduel: "fanduel",
  betmgm: "betmgm",
  williamhillus: "caesars",
  williamhill: "caesars",
  caesars: "caesars",
  caesarssportsbook: "caesars",
  fanatics: "fanatics",
  fanaticssportsbook: "fanatics",
  betrivers: "betrivers",
  espnbet: "thescore",
  thescorebet: "thescore",
  thescore: "thescore",
  hardrockbet: "hardrock",
  ballybet: "bally",
};

// Only provider-supplied links on the matching sportsbook's own host qualify.
// These are validation boundaries, not templates for constructing game URLs.
const BOOK_HOSTS: Record<Sportsbook, readonly string[]> = {
  draftkings: ["sportsbook.draftkings.com"],
  fanduel: ["sportsbook.fanduel.com"],
  betmgm: ["betmgm.com"],
  caesars: ["sportsbook.caesars.com"],
  fanatics: ["sportsbook.fanatics.com", "betfanatics.com"],
  betrivers: ["betrivers.com"],
  thescore: ["thescore.bet", "espnbet.com"],
  hardrock: ["hardrock.bet"],
  bally: ["ballybet.com"],
};

function sportsbookIdentity(value: unknown): Sportsbook | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s_.-]/g, "");
  return Object.hasOwn(BOOK_ALIASES, normalized) ? BOOK_ALIASES[normalized] : undefined;
}

function safeEventLink(value: unknown, book: Sportsbook, state?: string | null): string | undefined {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u001f\u007f\\]/.test(value)) return undefined;
  const stateCode = sportsbookStateCode(state);
  // Never guess a state or replace unrelated placeholders. In particular this
  // must happen before URL parsing: some providers put {state} in the hostname.
  const supplied = stateCode
    ? value.trim().replace(/(?<!\$)\{state\}|%7[bB]state%7[dD]/g, stateCode)
    : value.trim();
  let url: URL;
  let destination: string;
  try {
    const decoded = decodeURIComponent(decodeURIComponent(supplied));
    if (/[{}<>]/.test(decoded)) return undefined;
    url = new URL(supplied);
    // Decode for validation only. Navigation retains the original provider URL.
    destination = decodeURIComponent(decodeURIComponent(`${url.pathname}${url.search}${url.hash}`)).toLowerCase();
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return undefined;
  if (!url.hostname.split(".").every((label) => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(label))) return undefined;
  if (!BOOK_HOSTS[book].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return undefined;

  // Opening a game must not silently select a wager, add to a betslip, or route
  // through a redirect/login endpoint. Market/outcome links are never examined.
  if (/bets?[-_\s]?slip|add[-_\s]?to[-_\s]?bet|place[-_\s]?bet|quick[-_\s]?bet/.test(destination)) return undefined;
  if (/(?:[/?&#=]|^)(?:redirect|redirect_uri|redirect_url|returnurl|returnto|next|url|login|logout|register|signup|deposit)(?:[/?&#=]|$)/.test(destination)) return undefined;
  if (/[?&#](?:selection(?:id|ids)?|outcome(?:id|ids)?|stake|amount)=/.test(destination)) return undefined;
  if (/https?:\/\//.test(destination)) return undefined;

  // A root/sport landing page isn't a link to this matchup. Accept event-like
  // routes or source identifiers, including the hash routes used by some books.
  const location = `${url.pathname}${url.hash}`.toLowerCase();
  const eventRoute = /(?:^|[/#!])(?:events?|games?|fixtures?|matches)(?:[/=_-])[^/?&#]+/.test(location);
  const sourceId = /(?:^|[/_-])(?:\d{4,}|[a-f0-9]{8}-[a-f0-9-]{12,})(?:$|[/_?#-])/.test(location);
  const eventQuery = [...url.searchParams.entries()].some(([key, id]) => /^(?:event|eventid|event_id|game|gameid|game_id|fixtureid)$/i.test(key) && /^[a-z\d][a-z\d_-]{2,}$/i.test(id));
  if (!eventRoute && !sourceId && !eventQuery) return undefined;
  return supplied;
}

/** The current game's supplied sportsbook event URL, or no link at all. */
export function sportsbookGameLink(game: OddsApiGame | null | undefined, bookKeyOrTitle: string | null | undefined, state?: string | null): string | undefined {
  if (!game || typeof bookKeyOrTitle !== "string") return undefined;
  const identity = sportsbookIdentity(bookKeyOrTitle);
  if (!identity) return undefined;
  for (const bookmaker of game.bookmakers ?? []) {
    if (sportsbookIdentity(bookmaker.key) !== identity) continue;
    const link = safeEventLink(bookmaker.link, identity, state);
    if (link) return link;
  }
  return undefined;
}
