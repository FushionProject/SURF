/** Team logos are third-party artwork: trademarked marks, served from the
 *  providers' own CDNs. A team's name and abbreviation are facts, and carry
 *  none of that exposure.
 *
 *  NEXT_PUBLIC_SURF_TEAM_MARKS=text switches every surface to text marks. The
 *  variable is read literally rather than through an env object so Next inlines
 *  it into the client bundles that render the cards. */
export type TeamMarkMode = "logos" | "text";

export function teamMarkModeFrom(value: string | undefined | null): TeamMarkMode {
  return value === "text" ? "text" : "logos";
}

export function teamLogosEnabled(): boolean {
  return teamMarkModeFrom(process.env.NEXT_PUBLIC_SURF_TEAM_MARKS) === "logos";
}
