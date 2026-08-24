"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

export type SurfTheme = "signal" | "atlas" | "onyx";

export const DEFAULT_SURF_THEME: SurfTheme = "signal";
export const SURF_THEME_STORAGE_KEY = "surf:theme";

const THEME_ORDER: SurfTheme[] = ["signal", "atlas", "onyx"];

export const SURF_THEME_LABELS: Record<SurfTheme, string> = {
  signal: "Signal",
  atlas: "Atlas",
  onyx: "Onyx",
};

function isSurfTheme(value: unknown): value is SurfTheme {
  return value === "signal" || value === "atlas" || value === "onyx";
}

// Inlined into the document before first paint so a stored theme is applied
// before React hydrates. Without this the page paints in the default theme for
// a frame and then snaps — very visible when the two themes differ this much.
export const SURF_THEME_INIT_SCRIPT = `(function(){try{var t=window.localStorage.getItem(${JSON.stringify(
  SURF_THEME_STORAGE_KEY,
)});if(t!=="signal"&&t!=="atlas"&&t!=="onyx"){t=${JSON.stringify(
  DEFAULT_SURF_THEME,
)};}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme",${JSON.stringify(
  DEFAULT_SURF_THEME,
)});}})();`;

// The <html data-theme> attribute is the source of truth — the pre-paint script
// above writes it before React exists, so React subscribes to it rather than
// owning it. Local writes notify these listeners; the `storage` event keeps
// other tabs in sync.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): SurfTheme {
  const applied = document.documentElement.getAttribute("data-theme");
  return isSurfTheme(applied) ? applied : DEFAULT_SURF_THEME;
}

// Server render (and hydration) always assumes the default; useSyncExternalStore
// re-reads the real value immediately after hydrating.
function getServerSnapshot(): SurfTheme {
  return DEFAULT_SURF_THEME;
}

function applyTheme(next: SurfTheme): void {
  document.documentElement.setAttribute("data-theme", next);
  try {
    window.localStorage.setItem(SURF_THEME_STORAGE_KEY, next);
  } catch {
    // Private mode / storage disabled — the theme still applies for this session.
  }
  for (const listener of listeners) listener();
}

type ThemeContextValue = {
  theme: SurfTheme;
  setTheme: (theme: SurfTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function SurfThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: SurfTheme) => applyTheme(next), []);
  const toggleTheme = useCallback(() => {
    const idx = THEME_ORDER.indexOf(theme);
    applyTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useSurfTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useSurfTheme must be used inside <SurfThemeProvider>");
  return ctx;
}
