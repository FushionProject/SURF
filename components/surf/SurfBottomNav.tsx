"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
};

const ITEMS: Item[] = [
  { label: "Games", href: "/games", isActive: (p) => p === "/games" || p.startsWith("/games/") },
  { label: "Signals", href: "/feed", isActive: (p) => p === "/feed" || p.startsWith("/top") },
];

export function SurfBottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation" className="sports-nav fixed bottom-0 left-0 right-0 z-50 border-t border-[color:var(--surf-line-06)] bg-[color:var(--surf-chrome-bg)]">
      <div className="sports-nav-inner">
        <div className="sports-nav-tabs">
          {ITEMS.map((it) => {
            const active = pathname ? it.isActive(pathname) : false;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className="sports-nav-link"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {it.label === "Games" ? (
                    <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2" /></>
                  ) : (
                    <><path d="M3 15h4l3-8 4 12 3-8h4" /><path d="M3 4h18" opacity=".35" /></>
                  )}
                </svg>
                <span>{it.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
