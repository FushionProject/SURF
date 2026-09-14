"use client";

import type { OddsApiGame } from "@/lib/surf/types";
import { sportsbookGameLink } from "@/lib/surf/sportsbookLinks";
import { useSportsbookLinkState } from "./SportsbookLinkPreferences";

export function SportsbookGameLink({ game, book }: { game?: OddsApiGame; book: string }) {
  const state = useSportsbookLinkState();
  const href = game ? sportsbookGameLink(game, book, state) : undefined;
  if (!href) return <span className="bn-book-name">{book}</span>;
  return <a className="bn-book-link" href={href} target="_blank" rel="noopener noreferrer"
    title={`Open ${game!.away_team} at ${game!.home_team} on ${book} (new tab)`}>
    {book}<span aria-hidden="true"> ↗</span><span className="sr-only"> — game page, opens in a new tab</span>
  </a>;
}
