"use client";

import Link from "next/link";

type Props = {
  title: string;
  subtitle: string;
};

export function SurfAppHeader({ title, subtitle }: Props) {
  return (
    <header className="pb-5 pt-6">
      <div>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-[color:var(--surf-ink-solid)]">Surf</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--surf-primary)]" />
          </div>
          <Link
            href="/account"
            aria-label="Open your Surf account"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] text-[color:var(--surf-ink-55)] transition-colors hover:border-[color:var(--surf-line-strong)] hover:text-[color:var(--surf-ink-solid)]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M12 12.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 7.5c.78-3.32 3.42-5.25 7-5.25s6.22 1.93 7 5.25"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        </div>
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.04em] text-[color:var(--surf-ink-solid)]">
          {title}
        </h1>
        <p className="mt-2 max-w-sm text-[15px] leading-6 text-[color:var(--surf-ink-55)]">{subtitle}</p>
      </div>
    </header>
  );
}
