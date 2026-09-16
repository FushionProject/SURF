"use client";

export function CloseSpotGames() {
  return <button type="button" onClick={event => {
    const details = event.currentTarget.closest("details");
    if (!details) return;
    details.open = false;
    const summary = details.querySelector("summary");
    summary?.focus({ preventScroll: true });
    summary?.scrollIntoView({ block: "center", behavior: "instant" });
  }} style={{ color: "var(--surf-primary)", padding: "12px 0", cursor: "pointer" }}>Close games −</button>;
}
