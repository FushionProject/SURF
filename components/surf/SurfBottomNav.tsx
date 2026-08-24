"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
};

const ITEMS: Item[] = [
  { label: "Main", href: "/", isActive: (p) => p === "/" },
  { label: "Top", href: "/top", isActive: (p) => p === "/top" || p.startsWith("/top/") },
  { label: "Games", href: "/games", isActive: (p) => p === "/games" || p.startsWith("/games/") },
  { label: "Eval", href: "/eval", isActive: (p) => p === "/eval" || p.startsWith("/eval/") },
];

export function SurfBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[color:var(--surf-line-06)] bg-[color:var(--surf-chrome-bg)]">
      <div className="surf-shell mx-auto w-full max-w-md px-4 py-3">
        <div className="grid grid-cols-4 gap-2">
          {ITEMS.map((it) => {
            const active = pathname ? it.isActive(pathname) : false;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={
                  active
                    ? "rounded-xl border border-[color:var(--surf-primary)]/35 bg-[color:var(--surf-surface)] px-3 py-2 text-center text-xs font-semibold tracking-wide text-[color:var(--surf-ink)] shadow-[0_0_22px_rgba(0,229,255,0.14)]"
                    : "rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-surface)] px-3 py-2 text-center text-xs font-semibold tracking-wide text-[color:var(--surf-ink-55)] transition-colors hover:text-[color:var(--surf-ink)]"
                }
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
