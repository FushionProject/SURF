/** Stable per-signal anchors: never use feed order, team names or a timestamp label. */
export function signalAnchorId(id: string): string {
  return `signal-${encodeURIComponent(id)}`;
}

export function signalHref(id: string, sport: string): string {
  return `/feed?sport=${encodeURIComponent(sport)}#${encodeURIComponent(signalAnchorId(id))}`;
}

export function signalIdFromHash(hash: string): string | null {
  try {
    const anchor = decodeURIComponent(hash.replace(/^#/, ""));
    // URL escaping and ID escaping are separate layers. Decode each exactly once
    // so a literal "%20" in a provider ID stays literal, not a space.
    return anchor.startsWith("signal-") && anchor.length > 7 ? decodeURIComponent(anchor.slice(7)) : null;
  } catch {
    return null;
  }
}
