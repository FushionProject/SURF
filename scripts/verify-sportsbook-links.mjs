import assert from "node:assert/strict";
import { sportsbookGameLink } from "../lib/surf/sportsbookLinks.ts";
import { getSharedOddsSnapshot } from "../lib/surf/sharedOddsSnapshot.ts";
import { SURF_ODDS_API_BOOKMAKER_KEYS } from "../lib/surf/bookmakers.ts";
import { SPORTSBOOK_STATES, sportsbookStateCode, isSportsbookState } from "../lib/surf/usStates.ts";

const fixtures = [
  ["draftkings", "DraftKings", "https://sportsbook.draftkings.com/event/bills-at-texans/1234567"],
  ["fanduel", "FanDuel", "https://sportsbook.fanduel.com/football/nfl/bills-%40-texans-1234567"],
  ["betmgm", "BetMGM", "https://sports.nj.betmgm.com/en/sports/events/bills-texans-1234567"],
  ["williamhill_us", "Caesars", "https://sportsbook.caesars.com/us/nj/bet/football/events/1234567"],
  ["fanatics", "Fanatics", "https://betfanatics.com/sportsbook/events/1234567"],
  ["betrivers", "BetRivers", "https://il.betrivers.com/?page=sportsbook#event/1234567"],
  ["espnbet", "theScore Bet", "https://sportsbook.thescore.bet/event/1234567"],
  ["hardrockbet", "Hard Rock Bet", "https://app.hardrock.bet/sportsbook/event/1234567"],
  ["ballybet", "Bally Bet", "https://sports.ballybet.com/?eventId=1234567"],
];
const game = {
  id: "game-a", sport_key: "americanfootball_nfl", sport_title: "NFL",
  commence_time: new Date(Date.now() + 86_400_000).toISOString(),
  home_team: "Houston Texans", away_team: "Buffalo Bills",
  bookmakers: fixtures.map(([key, title, link]) => ({ key, title, link, markets: [] })),
};
const unchanged = JSON.stringify(game);
for (const [key, title, link] of fixtures) {
  assert.equal(sportsbookGameLink(game, key), link, `${key} uses its supplied event link`);
  assert.equal(sportsbookGameLink(game, title), link, `${title} matches its curated identity`);
}
for (const alias of ["ESPN BET", "espn_bet", " theScore Bet ", "thescorebet"]) {
  assert.equal(sportsbookGameLink(game, alias), fixtures[6][2]);
}
for (const alias of ["William Hill", "williamhill_us", "CAESARS", "Caesars Sportsbook"]) {
  assert.equal(sportsbookGameLink(game, alias), fixtures[3][2]);
}
assert.equal(sportsbookGameLink(game, "Bovada"), undefined);
assert.equal(sportsbookGameLink(game, "betPARX"), undefined);
assert.equal(sportsbookGameLink(game, "9 books"), undefined);
assert.equal(sportsbookGameLink(game, "constructor"), undefined);
assert.equal(sportsbookGameLink(game, "__proto__"), undefined);
assert.equal(sportsbookGameLink(undefined, "DraftKings"), undefined);
assert.equal(sportsbookGameLink(game, undefined), undefined);
assert.equal(sportsbookGameLink({ ...game, bookmakers: undefined }, "DraftKings"), undefined);
assert.equal(sportsbookGameLink({ ...game, bookmakers: [{ key: "outsider", title: "DraftKings", link: fixtures[0][2] }] }, "DraftKings"), undefined, "titles cannot promote an unrecognized provider key");
assert.equal(sportsbookGameLink({ ...game, bookmakers: [{ title: "DraftKings", link: fixtures[0][2] }] }, "DraftKings"), undefined, "malformed provider keys fail closed");

const withLink = (link) => ({ ...game, bookmakers: [{ key: "draftkings", title: "DraftKings", link }] });
const unsafe = [
  null, undefined, "", "not a URL", "javascript:alert(1)", "data:text/html,test",
  "http://sportsbook.draftkings.com/event/1234567",
  "https://sportsbook.draftkings.com:8443/event/1234567",
  "https://user:password@sportsbook.draftkings.com/event/1234567",
  "https://sportsbook.draftkings.com.evil.example/event/1234567",
  "https://evil-sportsbook.draftkings.com/event/1234567",
  "https://sportsbook.fanduel.com/event/1234567",
  "https://sportsbook.draftkings.com/", "https://sportsbook.draftkings.com/?utm_source=surf",
  "https://sportsbook.draftkings.com/sports/football/nfl", "https://sportsbook.draftkings.com/help",
  "https://sportsbook.draftkings.com/addToBetslip?eventId=1234567",
  "https://sportsbook.draftkings.com/event/1234567?selectionId=111",
  "https://sportsbook.draftkings.com/event/1234567#betslip",
  "https://sportsbook.draftkings.com/event/1234567?redirect=https%3A%2F%2Fevil.example",
  "https://sportsbook.draftkings.com/event/1234567?next=%2Fdeposit",
  "https://sportsbook.draftkings.com/event/1234567/bet%2573lip",
  "https://sportsbook.draftkings.com/event/1234567?amount=5",
  "https://sportsbook.draftkings.com/event/1234567\n",
  "https://sportsbook.draftkings.com/event/%xx",
];
for (const link of unsafe) assert.equal(sportsbookGameLink(withLink(link), "DraftKings"), undefined, `fails closed: ${link}`);
const nestedOnly = { ...game, bookmakers: [{ key: "draftkings", title: "DraftKings", markets: [{ key: "h2h", link: fixtures[0][2], outcomes: [{ name: "Houston Texans", link: fixtures[0][2] }] }] }] };
assert.equal(sportsbookGameLink(nestedOnly, "DraftKings"), undefined, "never promotes a market or outcome/betslip URL to a game URL");
const otherGame = { ...game, id: "game-b", bookmakers: [{ key: "draftkings", title: "DraftKings", link: "https://sportsbook.draftkings.com/event/other-matchup/7654321" }] };
assert.equal(sportsbookGameLink(otherGame, "DraftKings"), otherGame.bookmakers[0].link);
assert.equal(sportsbookGameLink({ ...otherGame, bookmakers: [] }, "DraftKings"), undefined, "a missing game-specific link never reuses another game's link");
assert.equal(JSON.stringify(game), unchanged, "link lookup does not mutate quotes or source data");

assert.equal(SPORTSBOOK_STATES.length, 51, "explicit US state/DC routing choices");
for (const { code } of SPORTSBOOK_STATES) {
  assert.equal(sportsbookStateCode(code), code);
  assert.equal(sportsbookStateCode(code.toUpperCase()), code);
  assert.equal(isSportsbookState(code), true);
}
const stateTemplates = [
  ["williamhill_us", "https://sportsbook.caesars.com/us/{state}/bet/americanfootball/4af90f96-a6eb-d733-5925-bd7a3fc81960/patriots-at-seahawks"],
  ["betmgm", "https://sports.{state}.betmgm.com/en/sports/events/patriots-@-seahawks-6%3A43103"],
  ["betrivers", "https://{state}.betrivers.com/?page=sportsbook#event/1027663017"],
];
for (const [key, link] of stateTemplates) {
  const withTemplate = { ...game, bookmakers: [{ key, title: key, link }] };
  assert.equal(sportsbookGameLink(withTemplate, key), undefined, "unresolved state template never becomes a link");
  assert.equal(sportsbookGameLink(withTemplate, key, "IL"), link.replace("{state}", "il"), "explicit state fills only the provider's state slot");
  assert.equal(sportsbookGameLink(withTemplate, key, "nj"), link.replace("{state}", "nj"));
  const encoded = { ...withTemplate, bookmakers: [{ key, title: key, link: link.replace("{state}", "%7Bstate%7D") }] };
  assert.equal(sportsbookGameLink(encoded, key), undefined, "encoded state templates also require a state");
  assert.equal(sportsbookGameLink(encoded, key, "IL"), link.replace("{state}", "il"), "encoded host templates are replaced before URL parsing");
  for (const invalid of [undefined, null, "", "xx", "UK", "Ontario", " IL ", "il.evil.example", "il/../../", "il?x=y", "i1", "ıL", "constructor", 12, {}]) {
    assert.equal(sportsbookStateCode(invalid), undefined);
    assert.equal(isSportsbookState(invalid), false);
    assert.equal(sportsbookGameLink(withTemplate, key, invalid), undefined, "junk state cannot alter a provider URL");
  }
}
for (const placeholder of ["{region}", "%7Bregion%7D", "%257Bstate%257D", "${state}", "{STATE}", "<state>"]) {
  assert.equal(sportsbookGameLink(withLink(`https://sportsbook.draftkings.com/event/1234567/${placeholder}`), "DraftKings", "il"), undefined, "unknown or unresolved placeholders never pass validation");
}
assert.equal(sportsbookGameLink(withLink("https://{region}.sportsbook.draftkings.com/event/1234567"), "DraftKings", "il"), undefined, "unknown host placeholders fail closed");
for (const [key, link] of [
  ["hardrockbet", "https://app.hardrock.bet/home/competition/nfl/6715565976424939839"],
  ["ballybet", "https://play.ballybet.com/sports#event/1027663017"],
]) assert.equal(sportsbookGameLink({ ...game, bookmakers: [{ key, title: key, link }] }, key), link, "observed non-template game routes remain enabled");
assert.equal(sportsbookGameLink(game, "DraftKings", "il"), fixtures[0][2], "state choice never rewrites a non-template provider destination");

const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async (input) => {
  requests += 1;
  const url = new URL(input);
  assert.equal(url.pathname, "/v4/sports/americanfootball_nfl/odds");
  assert.equal(url.searchParams.get("includeLinks"), "true");
  assert.equal(url.searchParams.get("markets"), "spreads,totals");
  assert.equal(url.searchParams.get("bookmakers"), SURF_ODDS_API_BOOKMAKER_KEYS.join(","));
  assert.equal(url.searchParams.has("regions"), false);
  assert.equal(url.searchParams.has("includeSids"), false);
  return Response.json([game]);
};
try {
  globalThis.__surfSharedOddsSnapshots.clear();
  const first = await getSharedOddsSnapshot({ sportKey: "americanfootball_nfl", apiKey: "offline-fixture" });
  assert.equal(sportsbookGameLink(first.games[0], "theScore Bet"), fixtures[6][2], "curation preserves provider event links");
  const cached = await getSharedOddsSnapshot({ sportKey: "americanfootball_nfl", apiKey: "offline-fixture" });
  assert.equal(cached.reused, true);
  assert.equal(requests, 1, "event links do not introduce a per-book, per-game, or repeated upstream call");
} finally {
  globalThis.fetch = originalFetch;
  globalThis.__surfSharedOddsSnapshots.clear();
}
console.log("Sportsbook game links passed: nine books, brand aliases, unsafe/cross-book/betslip/homepage rejection, game isolation, and one shared request.");
