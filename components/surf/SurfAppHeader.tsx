"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SurfBrandMark } from "@/components/surf/SurfBrandMark";

type Props = {
  title: string;
  subtitle: string;
};

const HEADER_LINKS = [
  { label: "Games", href: "/games" },
  { label: "Signals", href: "/feed" },
  { label: "How to use", href: "/how-to-use" },
] as const;

export function SurfAppHeader({ title, subtitle }: Props) {
  const pathname = usePathname();

  return (
    <header className="sports-header pb-5 pt-6">
      <div>
        <div className="sports-masthead">
          <Link href="/games" prefetch={false} className="sports-brand" aria-label="Surf home">
            <SurfBrandMark className="sports-brand-mark" />
            <span className="sports-wordmark">surf<span>.</span></span>
          </Link>
          <nav aria-label="Header navigation" className="sports-header-tabs">
            {HEADER_LINKS.map(({ label, href }) => {
              const active = pathname === href || pathname?.startsWith(`${href}/`) ||
                (href === "/feed" && (pathname === "/top" || pathname?.startsWith("/top/")));
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className="sports-header-tab"
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/account"
            prefetch={false}
            aria-label="Open your Surf account"
            className="sports-account-link flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--surf-line-08)] bg-transparent text-[color:var(--surf-ink-55)] transition-colors hover:border-[color:var(--surf-primary)] hover:text-[color:var(--surf-ink-solid)]"
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
        <h1 className="text-[32px] font-bold leading-tight tracking-[-0.03em] text-[color:var(--surf-ink-solid)]">
          {title}
        </h1>
        <p className="mt-2 max-w-sm text-[15px] leading-6 text-[color:var(--surf-ink-55)]">{subtitle}</p>
      </div>
    </header>
  );
}
