"use client";

import { SURF_VISIBLE_SPORTS, type SurfSportKey } from "@/lib/surf/sports";

type Props = {
  value: SurfSportKey;
  onChange: (sport: SurfSportKey) => void;
  disabled?: boolean;
};

export function SportSelector({ value, onChange, disabled = false }: Props) {
  return (
    <div className="sports-selector mb-4">
      <div className="flex gap-6 border-b border-[color:var(--surf-line-10)]">
          {SURF_VISIBLE_SPORTS.map((sport) => (
            <button
              key={sport.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(sport.key)}
              className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold tracking-wide transition-colors disabled:cursor-wait disabled:opacity-60 ${
                value === sport.key
                  ? "bg-[color:var(--surf-fill-08)] text-[color:var(--surf-ink-solid)]"
                  : "text-[color:var(--surf-ink-65)] hover:text-[color:var(--surf-ink-solid)]"
              }`}
              aria-pressed={value === sport.key}
            >
              {sport.selectorLabel}
            </button>
          ))}
      </div>
    </div>
  );
}
