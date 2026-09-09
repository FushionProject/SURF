import type { CoachAppointment, InternationalCoverage } from "./spot-feed.ts";

// Minimal source-backed context, not a copied sports dataset. Historical outcomes
// are calculated from the separate private archive and never hard-coded here.
export const INTERNATIONAL_REVIEW_SHA = "7773a55d21119b5f3150b44c8c97faa0cd6126f528c2737f44d64d5e89dc5249";
export const VERIFIED_COACHES: CoachAppointment[] = [
  {
    "team": "ARI",
    "coach": "Mike LaFleur",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.azcardinals.com/team/coaches-roster/mike-lafleur"
  },
  {
    "team": "ATL",
    "coach": "Kevin Stefanski",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.atlantafalcons.com/news/atlanta-falcons-2026-coaching-staff"
  },
  {
    "team": "BAL",
    "coach": "Jesse Minter",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.baltimoreravens.com/news/ravens-announce-2026-coaching-staff"
  },
  {
    "team": "BUF",
    "coach": "Joe Brady",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.buffalobills.com/team/coaches-roster/joe-brady"
  },
  {
    "team": "CAR",
    "coach": "Dave Canales",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.panthers.com/team/coaches-roster/dave-canales"
  },
  {
    "team": "CHI",
    "coach": "Ben Johnson",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.chicagobears.com/team/coaches/"
  },
  {
    "team": "CIN",
    "coach": "Zac Taylor",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.bengals.com/team/coaches-roster/zac-taylor"
  },
  {
    "team": "CLE",
    "coach": "Todd Monken",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.clevelandbrowns.com/team/coaches-roster/todd-monken"
  },
  {
    "team": "DAL",
    "coach": "Brian Schottenheimer",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.dallascowboys.com/team/coaches-roster/brian-schottenheimer"
  },
  {
    "team": "DEN",
    "coach": "Sean Payton",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.denverbroncos.com/team/coaches-roster/sean-payton"
  },
  {
    "team": "DET",
    "coach": "Dan Campbell",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.detroitlions.com/news/lions-announce-2026-coaching-staff"
  },
  {
    "team": "GB",
    "coach": "Matt LaFleur",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.packers.com/team/coaches-roster/matt-lafleur"
  },
  {
    "team": "HOU",
    "coach": "DeMeco Ryans",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.houstontexans.com/news/houston-texans-announce-2026-coaching-staff"
  },
  {
    "team": "IND",
    "coach": "Shane Steichen",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.colts.com/team/coaches-roster/shane-steichen"
  },
  {
    "team": "JAX",
    "coach": "Liam Coen",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.jaguars.com/team/coaches-roster/liam-coen"
  },
  {
    "team": "KC",
    "coach": "Andy Reid",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.chiefs.com/team/coaches-roster/andy-reid"
  },
  {
    "team": "LAC",
    "coach": "Jim Harbaugh",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.chargers.com/team/coaches-roster/jim-harbaugh"
  },
  {
    "team": "LAR",
    "coach": "Sean McVay",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.therams.com/news/rams-2026-coaching-staff-set"
  },
  {
    "team": "LV",
    "coach": "Klint Kubiak",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.raiders.com/team/coaches-roster/klint-kubiak"
  },
  {
    "team": "MIA",
    "coach": "Jeff Hafley",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.miamidolphins.com/team/front-office-roster/jeff-hafley"
  },
  {
    "team": "MIN",
    "coach": "Kevin O'Connell",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.vikings.com/news/2026-coaching-staff-updates-promotions-hires"
  },
  {
    "team": "NE",
    "coach": "Mike Vrabel",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.patriots.com/news/patriots-coaching-staff-updates-for-2026"
  },
  {
    "team": "NO",
    "coach": "Kellen Moore",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.neworleanssaints.com/team/coaches-roster/kellen-moore"
  },
  {
    "team": "NYG",
    "coach": "John Harbaugh",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.giants.com/news/john-harbaugh-announces-2026-coaching-staff-coordinators-matt-nagy-dennard-wilson-chris-horton"
  },
  {
    "team": "NYJ",
    "coach": "Aaron Glenn",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.newyorkjets.com/team/coaches-roster/aaron-glenn"
  },
  {
    "team": "PHI",
    "coach": "Nick Sirianni",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.philadelphiaeagles.com/team/coaches/"
  },
  {
    "team": "PIT",
    "coach": "Mike McCarthy",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.steelers.com/team/coaches-roster/mike-mccarthy"
  },
  {
    "team": "SEA",
    "coach": "Mike Macdonald",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.seahawks.com/team/coaches-roster/mike-macdonald"
  },
  {
    "team": "SF",
    "coach": "Kyle Shanahan",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.49ers.com/team/coaches-roster/kyle-shanahan"
  },
  {
    "team": "TB",
    "coach": "Todd Bowles",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.buccaneers.com/team/coaches-roster/mobile"
  },
  {
    "team": "TEN",
    "coach": "Robert Saleh",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.tennesseetitans.com/team/coaches-roster/robert-saleh"
  },
  {
    "team": "WAS",
    "coach": "Dan Quinn",
    "season": 2026,
    "verifiedAt": "2026-09-09T02:39:55.746Z",
    "sourceUrl": "https://www.commanders.com/news/commanders-announce-2026-coaching-staff"
  }
];
export const MCVAY_INTERNATIONAL: InternationalCoverage = {
  coach: "Sean McVay", team: "LAR", seasonFrom: 2017, seasonThrough: 2025,
  fixtures: [
    { gameId: "2017_07_ARI_LA", country: "England", sourceUrl: "https://www.therams.com/news/rams-shut-out-cardinals-in-london-improve-to-5-2-19621309" },
    { gameId: "2019_08_CIN_LA", country: "England", sourceUrl: "https://www.therams.com/news/game-recap-rams-beat-bengals-24-10" },
    { gameId: "2025_07_LA_JAX", country: "England", sourceUrl: "https://www.therams.com/news/from-the-podium-sean-mcvay-matthew-stafford-and-davante-adams-discuss-rams-blowout-win-over-jaguars-in-london" },
    { gameId: "2026_01_SF_LA", country: "Australia", sourceUrl: "https://www.therams.com/game-day/international/australia" },
  ],
};
// Complete only for McVay's Rams 2017–2025: the Rams' official London history
// identifies the earlier 2012/2016 trips before his tenure. Mexico 2018 was moved
// to LA; domestic neutral/playoff games do not qualify. Other teams are unverified.
export const INTERNATIONAL_MEMBERSHIP_SOURCE = "https://www.therams.com/news/rams-to-face-jaguars-in-london-in-2025-wembley-stadium-nfl-international-series";
