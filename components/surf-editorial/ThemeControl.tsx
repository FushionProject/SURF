"use client";
import { useSyncExternalStore } from "react";
const KEY = "surf:editorial-theme";
type Mode = "light" | "dark" | "system";
const valid = (value: string | null): Mode =>
  value === "light" || value === "dark" ? value : "system";
const listeners = new Set<() => void>();
function apply(mode: Mode) {
  document.documentElement.dataset.appearance = mode;
  document.documentElement.dataset.surfMode =
    mode === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = matchMedia("(prefers-color-scheme: dark)");
  const syncSystem = () =>
    apply(valid(document.documentElement.dataset.appearance ?? null));
  const syncStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) apply(valid(event.newValue));
  };
  media.addEventListener("change", syncSystem);
  window.addEventListener("storage", syncStorage);
  syncSystem();
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", syncSystem);
    window.removeEventListener("storage", syncStorage);
  };
}
export function ThemeControl() {
  const mode = useSyncExternalStore(
    subscribe,
    () => valid(document.documentElement.dataset.appearance ?? null),
    () => "system" as Mode,
  );
  return (
    <label className="bn-theme-control">
      <span>Appearance</span>
      <select
        aria-label="Color theme"
        value={mode}
        onChange={(event) => {
          const next = valid(event.target.value);
          apply(next);
          try {
            localStorage.setItem(KEY, next);
          } catch {
            /* Keep the selection for this session when storage is unavailable. */
          }
        }}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
