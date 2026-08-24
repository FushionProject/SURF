"use client";

import { ThemeToggle } from "@/components/surf/ThemeToggle";
import { TopTabs } from "@/components/surf/TopTabs";

type RefreshMode = "dynamic" | "fixed15" | "manual";

type Props = {
  subtitle: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  refreshMode?: RefreshMode;
  onRefreshModeChange?: (mode: RefreshMode) => void;
};

export function SurfHeader({ subtitle, onRefresh, isRefreshing, refreshMode, onRefreshModeChange }: Props) {
  return (
    <header className="sticky top-0 z-50 -mx-4 mb-5 border-b border-[color:var(--surf-line-06)] bg-[color:var(--surf-chrome-bg)] px-4 pb-4 pt-4">
      <div className="surf-shell mx-auto w-full max-w-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-[color:var(--surf-ink-solid)]">Surf</h1>
            <div className="h-2 w-2 rounded-full bg-[color:var(--surf-primary)] shadow-[0_0_26px_rgba(0,229,255,0.40)]" />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            <button
              type="button"
              onClick={() => {
                if (isRefreshing) return;
                if (refreshMode === "manual") console.log("[SURF] Manual refresh triggered");
                onRefresh();
              }}
              className="rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)] px-3 py-1.5 text-xs font-medium tracking-wide text-[color:var(--surf-ink-80)] shadow-none transition-all duration-200 hover:border-[color:var(--surf-primary)]/35 hover:text-[color:var(--surf-ink)] hover:shadow-[0_0_18px_rgba(0,229,255,0.12)] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* surf-headmeta is `display: contents` in the signal theme, so these two
            rows stack exactly as before; atlas collapses them into one toolbar row. */}
        <div className="surf-headmeta">
          <div className="surf-headtabs mt-3 flex justify-center">
            <TopTabs className="mt-0" />
          </div>

          {refreshMode && onRefreshModeChange ? (
            <div className="surf-headmode mt-3 flex justify-end">
            <div className="inline-flex items-center gap-2">
              <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-35)]">Refresh Mode</div>
              <div className="inline-flex rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-02)] p-0.5">
                <button
                  type="button"
                  onClick={() => onRefreshModeChange("dynamic")}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                    refreshMode === "dynamic" ? "bg-[color:var(--surf-fill-08)] text-[color:var(--surf-ink-solid)]" : "text-[color:var(--surf-ink-55)] hover:text-[color:var(--surf-ink-solid)]"
                  }`}
                >
                  Dynamic
                </button>
                <button
                  type="button"
                  onClick={() => onRefreshModeChange("fixed15")}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                    refreshMode === "fixed15" ? "bg-[color:var(--surf-fill-08)] text-[color:var(--surf-ink-solid)]" : "text-[color:var(--surf-ink-55)] hover:text-[color:var(--surf-ink-solid)]"
                  }`}
                >
                  15 min
                </button>
                <button
                  type="button"
                  onClick={() => onRefreshModeChange("manual")}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                    refreshMode === "manual" ? "bg-[color:var(--surf-fill-08)] text-[color:var(--surf-ink-solid)]" : "text-[color:var(--surf-ink-55)] hover:text-[color:var(--surf-ink-solid)]"
                  }`}
                >
                  Manual
                </button>
              </div>
              </div>
            </div>
          ) : null}
        </div>

        <p className="surf-headsub mt-3 text-sm text-[color:var(--surf-ink-55)]">{subtitle}</p>
      </div>
    </header>
  );
}
