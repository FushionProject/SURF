"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Tab = {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    label: "Main",
    href: "/",
    isActive: (p) => p === "/",
  },
  {
    label: "Top",
    href: "/top",
    isActive: (p) => p === "/top" || p.startsWith("/top/"),
  },
];

export function TopTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <nav className={["mt-4 flex w-full items-center justify-start", className ?? ""].join(" ").trim()}>
      <div className="inline-flex rounded-full border border-white/[0.08] bg-[#0a0a0a] p-1 shadow-none">
        {TABS.map((t) => {
          const active = hydrated ? t.isActive(pathname ?? "") : false;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                active
                  ? "rounded-full border border-[color:var(--surf-primary)]/35 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-[color:var(--surf-ink)] shadow-[0_0_18px_rgba(0,229,255,0.14)] transition-all"
                  : "rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide text-white/55 transition-all hover:bg-white/[0.06] hover:text-[color:var(--surf-ink)]"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
