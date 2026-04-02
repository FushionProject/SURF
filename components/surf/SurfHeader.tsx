"use client";

import { TopTabs } from "@/components/surf/TopTabs";

type Props = {
  subtitle: string;
  onRefresh: () => void;
  isRefreshing: boolean;
};

export function SurfHeader({ subtitle, onRefresh, isRefreshing }: Props) {
  return (
    <header className="sticky top-0 z-50 -mx-4 mb-5 border-b border-white/[0.06] bg-[#050505] px-4 pb-4 pt-4">
      <div className="mx-auto w-full max-w-md">
        <div className="grid grid-cols-3 items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-white">Surf</h1>
            <div className="h-2 w-2 rounded-full bg-[color:var(--surf-primary)] shadow-[0_0_26px_rgba(0,229,255,0.40)]" />
          </div>

          <div className="flex justify-center">
            <TopTabs className="mt-0" />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (isRefreshing) return;
                onRefresh();
              }}
              className="rounded-full border border-white/[0.10] bg-[#0a0a0a] px-3 py-1.5 text-xs font-medium tracking-wide text-white/80 shadow-none transition-all duration-200 hover:border-[color:var(--surf-primary)]/35 hover:text-[color:var(--surf-ink)] hover:shadow-[0_0_18px_rgba(0,229,255,0.12)] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
        </div>

        <p className="mt-3 text-sm text-white/55">{subtitle}</p>
      </div>
    </header>
  );
}
