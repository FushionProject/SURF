"use client";

import { SURF_SPORTS, type SurfSportKey } from "@/lib/surf/sports";

type Props = {
  value: SurfSportKey;
  onChange: (sport: SurfSportKey) => void;
  disabled?: boolean;
};

export function SportSelector({ value, onChange, disabled = false }: Props) {
  return (
    <div className="mb-4">
      <div className="grid w-full grid-cols-4 rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] p-1">
          {SURF_SPORTS.map((sport) => (
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
