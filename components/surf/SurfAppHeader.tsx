"use client";

type Props = {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
};

export function SurfAppHeader({ title, subtitle, onRefresh, isRefreshing = false }: Props) {
  return (
    <header className="pb-5 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-5 flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-[color:var(--surf-ink-solid)]">Surf</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--surf-primary)]" />
          </div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.04em] text-[color:var(--surf-ink-solid)]">
            {title}
          </h1>
          <p className="mt-2 max-w-xs text-sm leading-5 text-[color:var(--surf-ink-55)]">{subtitle}</p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh market data"
          className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] text-[color:var(--surf-ink-65)] transition hover:border-[color:var(--surf-line-strong)] hover:text-[color:var(--surf-ink-solid)] disabled:cursor-wait disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6v5h-5" />
            <path d="M4 18v-5h5" />
            <path d="M6.1 9A7 7 0 0 1 18.5 6.5L20 11" />
            <path d="M17.9 15A7 7 0 0 1 5.5 17.5L4 13" />
          </svg>
        </button>
      </div>
    </header>
  );
}
