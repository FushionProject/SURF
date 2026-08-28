"use client";

import { useState } from "react";

import type { SignalCard as SignalCardType } from "@/lib/surf/types";
import { getLastMovedLabel } from "@/lib/surf/signalCopy";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getTeamLogo } from "@/lib/teamLogos";
import { getMlbDefaultLogo } from "@/lib/mlbLogos";

type Variant = {
  accentName: string;
  badgeClass: string;
  borderClass: string;
  glowClass: string;
  valueBoxClass: string;
  cardGlowClass: string;
};

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function renderKeyDetail(detail: string, highlightDirection = true) {
  const m = detail.match(/^(.*?)([+-]?\d+(?:\.\d+)?)(\s*(?:→|vs)\s*)([+-]?\d+(?:\.\d+)?)(.*)$/);
  if (!m) return <>{detail}</>;

  const prefix = m[1] ?? "";
  const aRaw = m[2] ?? "";
  const mid = m[3] ?? "";
  const bRaw = m[4] ?? "";
  const suffix = m[5] ?? "";

  const a = Number(aRaw);
  const b = Number(bRaw);
  const dir = Number.isFinite(a) && Number.isFinite(b) ? b - a : 0;
  const bClass = highlightDirection
    ? dir >= 0.5
      ? "text-[color:var(--surf-positive)]"
      : dir <= -0.5
        ? "text-[color:var(--surf-negative)]"
        : "text-[color:var(--surf-ink-solid)]"
    : "text-[color:var(--surf-ink-solid)]";

  return (
    <>
      <span className="text-[color:var(--surf-ink-solid)]">{prefix}</span>
      <span className="text-[color:var(--surf-ink-solid)]">{aRaw}</span>
      <span className="text-[color:var(--surf-ink-70)]">{mid}</span>
      <span className={bClass}>{bRaw}</span>
      <span className="text-[color:var(--surf-ink-solid)]">{suffix}</span>
    </>
  );
}

function formatDelta(value: number): string {
  const v = roundToHalf(value);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

function extractFirstTwoNumbers(detail: string): { a?: number; b?: number } {
  const matches = detail.match(/[+-]?\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return {};

  const a = Number(matches[0]);
  const b = matches.length >= 2 ? Number(matches[1]) : undefined;
  return {
    a: Number.isFinite(a) ? a : undefined,
    b: b != null && Number.isFinite(b) ? b : undefined,
  };
}

function getVariant(signalType: SignalCardType["signalType"]): Variant {
  if (signalType === "Book Disagreement") {
    return {
      accentName: "Neutral",
      badgeClass:
        "border-[color:var(--surf-neutral)]/30 bg-[color:var(--surf-neutral)]/10 text-[color:var(--surf-neutral)]",
      borderClass: "border-[color:var(--surf-neutral)]/18",
      glowClass: "bg-[color:var(--surf-neutral)]/12",
      valueBoxClass:
        "border-[color:var(--surf-neutral)]/26 bg-[color:var(--surf-neutral)]/10 text-[color:var(--surf-ink)]",
      cardGlowClass: "shadow-[0_0_44px_rgba(255,200,87,0.12)]",
    };
  }

  if (signalType === "Stale Book") {
    return {
      accentName: "Negative",
      badgeClass:
        "border-[color:var(--surf-negative)]/28 bg-[color:var(--surf-negative)]/10 text-[color:var(--surf-negative)]",
      borderClass: "border-[color:var(--surf-negative)]/18",
      glowClass: "bg-[color:var(--surf-negative)]/10",
      valueBoxClass:
        "border-[color:var(--surf-negative)]/24 bg-[color:var(--surf-negative)]/10 text-[color:var(--surf-ink)]",
      cardGlowClass: "shadow-[0_0_44px_rgba(255,77,77,0.10)]",
    };
  }

  if (signalType === "Line Movement" || signalType === "Market Movement") {
    return {
      accentName: "Positive",
      badgeClass:
        "border-[color:var(--surf-positive)]/28 bg-[color:var(--surf-positive)]/10 text-[color:var(--surf-positive)]",
      borderClass: "border-[color:var(--surf-positive)]/18",
      glowClass: "bg-[color:var(--surf-positive)]/10",
      valueBoxClass:
        "border-[color:var(--surf-positive)]/24 bg-[color:var(--surf-positive)]/10 text-[color:var(--surf-ink)]",
      cardGlowClass: "shadow-[0_0_44px_rgba(0,255,136,0.10)]",
    };
  }

  return {
    accentName: "Primary",
    badgeClass:
      "border-[color:var(--surf-primary)]/30 bg-[color:var(--surf-primary)]/10 text-[color:var(--surf-primary)]",
    borderClass: "border-[color:var(--surf-primary)]/18",
    glowClass: "bg-[color:var(--surf-primary)]/12",
    valueBoxClass:
      "border-[color:var(--surf-primary)]/26 bg-[color:var(--surf-primary)]/10 text-[color:var(--surf-ink)]",
    cardGlowClass: "shadow-[0_0_44px_rgba(0,229,255,0.10)]",
  };
}

function formatCommenceTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";

  return dt.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Props = {
  card: SignalCardType;
  showStrength?: boolean;
  showStrengthLabel?: boolean;
};

function parseAmericanOdds(value: string | undefined): number | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function getWhyThisMattersText(signalType: SignalCardType["signalType"], card: SignalCardType): string {
  if (signalType === "Arbitrage") {
    return "Opposite outcomes are priced below 100% combined implied probability → a theoretical cross-book return exists if both quotes can be filled.";
  }

  if (signalType === "Best Number") {
    return "One sportsbook is off market → potential value before the market adjusts.";
  }

  if (signalType === "Run Line Price Conflict") {
    return "Books disagree on true probability → pricing may be inefficient.";
  }

  if (signalType === "Book Disagreement") {
    if (card.valueOptions && card.valueOptions.length > 0) {
      return card.market === "totals"
        ? "Over gets the lower total; Under gets the higher total. Compare the price before acting."
        : "The better number depends on your side. Use the book giving that team more points, then compare the price.";
    }
    return "Books haven’t aligned yet → there may be value in line shopping.";
  }

  if (signalType === "Line Movement" || signalType === "Market Movement") {
    if (card.lineMovement === 0) {
      return "Most books are aligned with little movement → this is a quiet-market baseline.";
    }
    return "The market is moving quickly → likely sharp action or new information.";
  }

  if (signalType === "Stale Book") {
    return "One book may be lagging the market → the number could correct soon.";
  }

  return "This market is showing unusual movement or disagreement.";
}

function strengthMeterStyle(score: number): {
  stroke: string;
  track: string;
  text: string;
  glow: string;
  dotGlow: string;
  label: "High" | "Medium" | "Low";
} {
  if (score >= 67) {
    return {
      stroke: "rgba(34, 197, 94, 0.95)",
      track: "rgba(34, 197, 94, 0.16)",
      text: "text-emerald-200/90",
      glow: "shadow-[0_0_22px_rgba(34,197,94,0.18)]",
      dotGlow: "0 0 10px rgba(34,197,94,0.22)",
      label: "High",
    };
  }
  if (score >= 34) {
    return {
      stroke: "rgba(245, 158, 11, 0.95)",
      track: "rgba(245, 158, 11, 0.16)",
      text: "text-amber-200/90",
      glow: "shadow-[0_0_22px_rgba(245,158,11,0.16)]",
      dotGlow: "0 0 10px rgba(245,158,11,0.20)",
      label: "Medium",
    };
  }
  return {
    stroke: "rgba(251, 113, 133, 0.92)",
    track: "rgba(251, 113, 133, 0.14)",
    text: "text-rose-200/80",
    glow: "shadow-[0_0_22px_rgba(251,113,133,0.14)]",
    dotGlow: "0 0 10px rgba(251,113,133,0.16)",
    label: "Low",
  };
}

function strengthTier(score: number): { dots: 1 | 2 | 3 | 4 | 5; label: "Quiet" | "Moderate" | "Solid" | "Strong" } {
  if (score >= 80) return { dots: 5, label: "Strong" };
  if (score >= 60) return { dots: 4, label: "Solid" };
  if (score >= 40) return { dots: 3, label: "Moderate" };
  return { dots: 1, label: "Quiet" };
}

export function StrengthDots({ score, showLabel }: { score: number; showLabel: boolean }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tier = strengthTier(clamped);
  const s = strengthMeterStyle(clamped);

  const dotOn = `bg-white/18 shadow-[0_0_0_1px_rgba(255,255,255,0.14)]`;
  const dotOff = `bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]`;

  return (
    <div
      aria-label={`Signal strength ${tier.label}`}
      title={`Signal strength: ${tier.label}`}
      className={`rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-03)] px-3 py-2 ${s.glow}`}
    >
      <div className="flex items-center justify-end gap-2">
        {Array.from({ length: 5 }).map((_, idx) => {
          const on = idx < tier.dots;
          return (
            <span
              key={idx}
              className={`h-2 w-2 rounded-full ${on ? dotOn : dotOff}`}
              style={
                on
                  ? {
                      backgroundColor: s.stroke,
                      boxShadow: s.dotGlow,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
      {showLabel ? (
        <div className="mt-1 text-right text-[11px] font-semibold tracking-tight text-[color:var(--surf-ink-70)]">{tier.label}</div>
      ) : null}
    </div>
  );
}

export function SignalCard({ card, showStrength, showStrengthLabel = true }: Props) {
  const time = formatCommenceTime(card.commenceTime);
  const variant = getVariant(card.signalType);
  const { a, b } = extractFirstTwoNumbers(card.detail);

  const whyThisMatters = getWhyThisMattersText(card.signalType, card);

  const strengthScore = (() => {
    const raw = typeof card.strengthScore === "number" && Number.isFinite(card.strengthScore) ? Math.round(card.strengthScore) : 0;
    return Math.max(0, Math.min(100, raw));
  })();

  const strengthTone = (() => {
    const tier = strengthTier(strengthScore);
    if (tier.dots >= 4) {
      return {
        title: "text-[color:var(--surf-ink-98)]",
        insight: "text-[color:var(--surf-ink-66)]",
      };
    }
    if (tier.dots <= 1) {
      return {
        title: "text-[color:var(--surf-ink-90)]",
        insight: "text-[color:var(--surf-ink-52)]",
      };
    }
    return {
      title: "text-[color:var(--surf-ink-95)]",
      insight: "text-[color:var(--surf-ink-60)]",
    };
  })();

  const awayAbbrev = getTeamAbbrev(card.game.awayTeam) ?? card.game.awayTeam;
  const homeAbbrev = getTeamAbbrev(card.game.homeTeam) ?? card.game.homeTeam;
  const hasValueOptions = card.signalType === "Book Disagreement" && Boolean(card.valueOptions?.length);
  const keyLabel =
    card.signalType === "Book Disagreement"
      ? card.market === "spreads"
        ? `${homeAbbrev} spread range`
        : "Total range"
      : "Key";

  const league = card.game.league;
  const awayLogo = getTeamLogo(card.game.awayTeam, league);
  const homeLogo = getTeamLogo(card.game.homeTeam, league);

  const mlbDefault = league === "MLB" ? getMlbDefaultLogo() : null;

  const [awayLogoOk, setAwayLogoOk] = useState(true);
  const [homeLogoOk, setHomeLogoOk] = useState(true);
  const [awayLogoSrc, setAwayLogoSrc] = useState<string | null>(awayLogo);
  const [homeLogoSrc, setHomeLogoSrc] = useState<string | null>(homeLogo);

  const _valueBox =
    card.signalType === "Book Disagreement" && a != null && b != null
      ? { label: "GAP", value: `${roundToHalf(Math.abs(b - a)).toFixed(1)} pts` }
      : card.signalType === "Best Number" && a != null && b != null
        ? { label: "EDGE", value: formatDelta(b - a) }
        : null;

  void _valueBox;

  return (
    <article
      className={`surf-card-hover surf-glass surf-edge group relative overflow-hidden rounded-[var(--surf-radius-card)] border shadow-[0_14px_60px_rgba(0,0,0,0.55)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[var(--surf-radius-card)] before:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[var(--surf-radius-card)] after:shadow-[0_0_0_1px_rgba(58,97,255,0.06)] ${variant.borderClass} ${variant.cardGlowClass}`}
      data-variant={variant.accentName}
    >
      <div className="relative flex flex-col gap-4 p-5">
        <div className="flex flex-col items-start gap-3">
          <div className="min-w-0 w-full">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex shrink-0 items-center gap-1.5">
                {awayLogoSrc && awayLogoOk ? (
                  <img
                    src={awayLogoSrc ?? undefined}
                    alt={card.game.awayTeam}
                    className="h-8 w-8 rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-06)] object-contain"
                    loading="lazy"
                    decoding="async"
                    onError={() => {
                      if (league === "MLB" && mlbDefault && awayLogoSrc !== mlbDefault) {
                        setAwayLogoSrc(mlbDefault);
                        return;
                      }
                      setAwayLogoOk(false);
                    }}
                  />
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-06)] text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-80)]">
                    {awayAbbrev}
                  </div>
                )}

                {homeLogoSrc && homeLogoOk ? (
                  <img
                    src={homeLogoSrc ?? undefined}
                    alt={card.game.homeTeam}
                    className="h-8 w-8 rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-06)] object-contain"
                    loading="lazy"
                    decoding="async"
                    onError={() => {
                      if (league === "MLB" && mlbDefault && homeLogoSrc !== mlbDefault) {
                        setHomeLogoSrc(mlbDefault);
                        return;
                      }
                      setHomeLogoOk(false);
                    }}
                  />
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-06)] text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-80)]">
                    {homeAbbrev}
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="min-w-0 truncate text-sm font-semibold text-[color:var(--surf-ink-90)]">
                  {awayAbbrev} <span className="text-[color:var(--surf-ink-35)]">@</span> {homeAbbrev}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--surf-ink-45)]">
                  {card.game.sportLabel} · {time || "Time unavailable"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-end">
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${variant.badgeClass}`}
            >
              {card.signalType}
            </span>
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">Signal</div>
            <h3 className={`mt-1 text-[15px] font-semibold tracking-tight ${strengthTone.title}`}>
              {card.title}
            </h3>
            {card.signalType === "Line Movement" || card.signalType === "Market Movement" ? (
              <p className="mt-1 text-xs text-[color:var(--surf-ink-55)]">{getLastMovedLabel(card) || "Last movement time unavailable"}</p>
            ) : card.recentMovementLabel ? (
              <p className="mt-1 text-xs text-[color:var(--surf-ink-55)]">{card.recentMovementLabel}</p>
            ) : null}
          </div>

          {showStrength ? (
            <div className="shrink-0 pt-0.5">
              <StrengthDots score={strengthScore} showLabel={showStrengthLabel} />
            </div>
          ) : null}
        </div>

        <div className="surf-inner rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-06)] bg-[color:var(--surf-fill-02)] px-4 py-3 shadow-[0_18px_55px_rgba(0,0,0,0.55)]">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">{keyLabel}</div>
              <p className="mt-1 font-mono text-[16px] font-semibold leading-6 text-[color:var(--surf-ink-solid)]">
                {renderKeyDetail(card.detail, card.signalType !== "Book Disagreement")}
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">
            {hasValueOptions ? "Where the value lies" : "Why this matters"}
          </div>
          <p className={`mt-1 text-[13px] leading-5 ${strengthTone.insight}`}>{whyThisMatters}</p>
        </div>

        {hasValueOptions ? (
          <div className="mt-1 rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-neutral)]/20 bg-[color:var(--surf-neutral)]/5 px-3 py-2.5">
            <div className="text-[11px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">Best line by side</div>
            <div className="mt-2 space-y-1.5">
              {card.valueOptions?.map((option) => {
                const selectionLabel = getTeamAbbrev(option.selection) ?? option.selection;
                return (
                  <div
                    key={`${option.selection}:${option.book}:${option.line}:${option.price ?? ""}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--surf-line-06)] bg-[color:var(--surf-inner)] px-3 py-2"
                  >
                    <span className="shrink-0 text-xs font-medium tracking-wide text-[color:var(--surf-ink-70)]">
                      Best for {selectionLabel}
                    </span>
                    <span className="min-w-0 truncate text-right text-sm font-medium text-[color:var(--surf-ink-solid)]">
                      {option.book}
                      <span className="ml-2 font-mono text-sm text-[color:var(--surf-positive)]">{option.line}</span>
                      {option.price ? (
                        <span className="ml-1 font-mono text-xs text-[color:var(--surf-ink-55)]">({option.price})</span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : card.sources && card.sources.length > 0 ? (
          card.signalType === "Best Number" ? (
            (() => {
              const best = card.sources.find((s) => (s.label ?? "").toLowerCase() === "best");
              const market = card.sources.find((s) => (s.label ?? "").toLowerCase() === "market");
              if (!best && !market) return null;

              return (
                <div className="mt-2 rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-06)] bg-[color:var(--surf-inner)] px-4 py-3">
                  <div className="text-[11px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">🎯 Best Available</div>
                  {best ? (
                    <div className="mt-2 flex items-baseline justify-between gap-3">
                      <span
                        className="rounded-lg border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-03)] px-2.5 py-1 font-mono text-[18px] font-semibold leading-none text-[color:var(--surf-ink-solid)] shadow-[0_0_16px_rgba(0,229,255,0.08)]"
                      >
                        {best.value}
                      </span>
                      <span className="min-w-0 truncate text-sm font-medium text-[color:var(--surf-ink-80)]">({best.book})</span>
                    </div>
                  ) : null}

                  {market ? (
                    <div className="mt-2 text-xs font-medium text-[color:var(--surf-ink-55)]">
                      Market Avg: <span className="font-mono text-[color:var(--surf-ink-70)]">{market.value}</span> <span className="text-[color:var(--surf-ink-45)]">({market.book})</span>
                    </div>
                  ) : null}
                </div>
              );
            })()
          ) : card.signalType === "Run Line Price Conflict" ? (
            (() => {
              const candidates = card.sources
                .map((s) => {
                  const odds = parseAmericanOdds(s.value);
                  return {
                    ...s,
                    _odds: odds,
                  };
                })
                .filter((s) => typeof s._odds === "number" && Number.isFinite(s._odds));

              if (candidates.length === 0) return null;

              // For American odds, higher numeric value is always better for the bettor (e.g. -170 > -203, +184 > +170).
              const best = candidates.reduce((acc, s) =>
                Number(s._odds) > Number(acc._odds) ? s : acc
              );

              // "Market Avg": pick the least favorable of the observed prices as the comparison point.
              // (If more sources are added later, this remains a stable, conservative comparison.)
              const market = candidates.reduce((acc, s) =>
                Number(s._odds) < Number(acc._odds) ? s : acc
              );

              const bestLine = `${best.label} (${best.value}) (${best.book})`;
              const marketLine = `${market.label} (${market.value}) (${market.book})`;

              return (
                <div className="mt-2 rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-06)] bg-[color:var(--surf-inner)] px-4 py-3">
                  <div className="text-[11px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">🎯 Best Available</div>

                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <span
                      className="min-w-0 truncate rounded-lg border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-03)] px-2.5 py-1 font-mono text-[16px] font-semibold leading-none text-[color:var(--surf-ink-solid)] shadow-[0_0_16px_rgba(0,229,255,0.08)]"
                    >
                      {bestLine}
                    </span>
                  </div>

                  <div className="mt-3 text-[11px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">Market Avg</div>
                  <div className="mt-1 text-xs font-medium text-[color:var(--surf-ink-55)]">
                    <span className="font-mono text-[color:var(--surf-ink-70)]">{marketLine}</span>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="mt-2 space-y-1.5">
              {card.sources.slice(0, 2).map((s) => (
                <div
                  key={`${s.label}:${s.book}:${s.value}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--surf-line-06)] bg-[color:var(--surf-inner)] px-3 py-2"
                >
                  <span className="text-xs font-medium tracking-wide text-[color:var(--surf-ink-70)]">
                    {s.label}:
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-[color:var(--surf-ink-solid)]">
                    {s.book}
                    <span className="ml-2 font-mono text-sm text-[color:var(--surf-ink-90)]">{s.value}</span>
                  </span>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </article>
  );
}
