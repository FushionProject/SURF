"use client";

import { useState } from "react";

import type { SignalCard as SignalCardType } from "@/lib/surf/types";
import { getLastMovedLabel } from "@/lib/surf/signalCopy";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getTeamLogo } from "@/lib/teamLogos";

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

function renderKeyDetail(detail: string) {
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
  const bClass =
    dir >= 0.5
      ? "text-[color:var(--surf-positive)]"
      : dir <= -0.5
        ? "text-[color:var(--surf-negative)]"
        : "text-white";

  return (
    <>
      <span className="text-white">{prefix}</span>
      <span className="text-white">{aRaw}</span>
      <span className="text-white/70">{mid}</span>
      <span className={bClass}>{bRaw}</span>
      <span className="text-white">{suffix}</span>
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
};

export function SignalCard({ card }: Props) {
  const time = formatCommenceTime(card.commenceTime);
  const variant = getVariant(card.signalType);
  const { a, b } = extractFirstTwoNumbers(card.detail);

  const awayAbbrev = getTeamAbbrev(card.game.awayTeam) ?? card.game.awayTeam;
  const homeAbbrev = getTeamAbbrev(card.game.homeTeam) ?? card.game.homeTeam;

  const awayLogo = getTeamLogo(card.game.awayTeam);
  const homeLogo = getTeamLogo(card.game.homeTeam);

  const [awayLogoOk, setAwayLogoOk] = useState(true);
  const [homeLogoOk, setHomeLogoOk] = useState(true);

  const valueBox =
    card.signalType === "Book Disagreement" && a != null && b != null
      ? { label: "GAP", value: `${roundToHalf(Math.abs(b - a)).toFixed(1)} pts` }
      : card.signalType === "Best Number" && a != null && b != null
        ? { label: "EDGE", value: formatDelta(b - a) }
        : null;

  return (
    <article
      className={`surf-card-hover surf-glass surf-edge group relative overflow-hidden rounded-3xl border shadow-[0_22px_80px_rgba(0,0,0,0.72)] ${variant.borderClass} ${variant.cardGlowClass}`}
      data-variant={variant.accentName}
    >
      <div className="relative flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex shrink-0 items-center gap-1.5">
                {awayLogo && awayLogoOk ? (
                  <img
                    src={awayLogo ?? undefined}
                    alt={card.game.awayTeam}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.06] object-contain"
                    loading="lazy"
                    decoding="async"
                    onError={() => setAwayLogoOk(false)}
                  />
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-[10px] font-semibold tracking-wide text-white/80">
                    {awayAbbrev}
                  </div>
                )}

                {homeLogo && homeLogoOk ? (
                  <img
                    src={homeLogo ?? undefined}
                    alt={card.game.homeTeam}
                    className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.06] object-contain"
                    loading="lazy"
                    decoding="async"
                    onError={() => setHomeLogoOk(false)}
                  />
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-[10px] font-semibold tracking-wide text-white/80">
                    {homeAbbrev}
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="min-w-0 truncate text-sm font-semibold text-white/90">
                  {awayAbbrev} <span className="text-white/35">@</span> {homeAbbrev}
                </p>
                <p className="mt-0.5 text-xs text-white/45">{time || ""}</p>
              </div>
            </div>
          </div>

          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${variant.badgeClass}`}
          >
            {card.signalType}
          </span>

          {card.isTopSignal ? (
            <span className="ml-2 shrink-0 rounded-full border border-[color:var(--surf-primary)]/35 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink)] shadow-[0_0_16px_rgba(0,229,255,0.12)]">
              {card.topBadge ?? "TOP"}
            </span>
          ) : null}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold tracking-wide text-white/45">Signal</div>
            <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-white/95">
              {card.title}
            </h3>
            {card.signalType === "Line Movement" || card.signalType === "Market Movement" ? (
              <p className="mt-1 text-xs text-white/55">{getLastMovedLabel(card) || "Last movement time unavailable"}</p>
            ) : card.recentMovementLabel ? (
              <p className="mt-1 text-xs text-white/55">{card.recentMovementLabel}</p>
            ) : null}
          </div>
        </div>

        <div className="surf-inner rounded-2xl px-4 py-3 shadow-[0_18px_55px_rgba(0,0,0,0.55)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold tracking-wide text-white/45">Key</div>
              <p className="mt-1 font-mono text-[16px] font-semibold leading-6 text-white">
                {renderKeyDetail(card.detail)}
              </p>
            </div>

            {valueBox ? (
              <div
                className={`shrink-0 rounded-xl border px-3 py-2 text-right shadow-[0_10px_28px_rgba(0,0,0,0.35)] ${variant.valueBoxClass}`}
              >
                <div className="text-[10px] font-bold tracking-[0.18em] opacity-80">
                  {valueBox.label}
                </div>
                <div className="mt-0.5 font-mono text-sm font-semibold leading-none">
                  {valueBox.value}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <p className="text-[13px] leading-5 text-white/60">{card.insight}</p>

        {card.sources && card.sources.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {card.sources.slice(0, 2).map((s) => (
              <div
                key={`${s.label}:${s.book}:${s.value}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#111111] px-3 py-2"
              >
                <span className="text-xs font-medium tracking-wide text-white/70">
                  {s.label}:
                </span>
                <span className="min-w-0 truncate text-sm font-medium text-white">
                  {s.book}
                  <span className="ml-2 font-mono text-sm text-white/90">{s.value}</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
