"use client";

import { SURF_THEME_LABELS, useSurfTheme } from "@/components/surf/ThemeProvider";
import type { SurfTheme } from "@/components/surf/ThemeProvider";

const OPTIONS: SurfTheme[] = ["signal", "atlas", "onyx"];

export function ThemeToggle() {
  const { theme, setTheme } = useSurfTheme();

  return (
    <div
      className="surf-segment inline-flex items-center rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-02)] p-0.5"
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map((option) => {
        const active = theme === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => setTheme(option)}
            aria-pressed={active}
            title={`${SURF_THEME_LABELS[option]} theme`}
            className={`surf-segment-item rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
              active ? "bg-[color:var(--surf-fill-08)] text-[color:var(--surf-ink-solid)]" : "text-[color:var(--surf-ink-55)] hover:text-[color:var(--surf-ink-solid)]"
            }`}
            data-active={active ? "true" : "false"}
          >
            {SURF_THEME_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
