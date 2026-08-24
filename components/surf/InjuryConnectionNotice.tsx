import type { NflInjuryFeed } from "@/lib/surf/injuries";
import { isNflSport, type SurfSportKey } from "@/lib/surf/sports";

type Props = {
  sport: SurfSportKey;
  injuries?: NflInjuryFeed;
};

export function InjuryConnectionNotice({ sport, injuries }: Props) {
  if (!isNflSport(sport) || !injuries) return null;

  const connected = injuries?.status === "available";
  const label = connected ? "Verified injury context connected" : "Injury context ready to connect";
  const detail = connected
    ? injuries?.isPartial
      ? "Verified reports are connected and the rest of the slate is loading within the provider limit."
      : "Market changes can be read alongside current API Sports reports."
    : injuries.status === "not_configured"
      ? "Odds are live. Add API Sports to pair line changes with verified player availability."
      : "The provider is connected. Verified reports will appear as slate coverage becomes available.";

  return (
    <div className="mb-4 flex gap-3 rounded-2xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] px-4 py-3">
      <span
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
          connected ? "bg-[color:var(--surf-positive)]" : "bg-[color:var(--surf-neutral)]"
        }`}
      />
      <div>
        <div className="text-xs font-semibold text-[color:var(--surf-ink-80)]">{label}</div>
        <div className="mt-0.5 text-[11px] leading-4 text-[color:var(--surf-ink-45)]">{detail}</div>
      </div>
    </div>
  );
}
