"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeControl } from "@/components/surf-editorial/ThemeControl";
import styles from "./SurfNavigation.module.css";

const links = [
  { href: "/", label: "Home" },
  { href: "/stats", label: "Trends" },
  { href: "/feed", label: "Signals" },
  { href: "/games", label: "Game briefs" },
  { href: "/top", label: "Watchlist" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/how-to-use", label: "How to use Surf" },
];

export function SurfNavigation({ sport, savedCount }: { sport?: string; savedCount?: number }) {
  const pathname = usePathname();
  return <header className={styles.header}>
    <div className={styles.inner}>
      <Link href="/" className={styles.brand} aria-label="Surf home"><span className={styles.logoFrame} aria-hidden="true"><span /></span>SURF</Link>
      <nav aria-label="Main navigation" className={styles.links}>
        {links.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : !href.includes("#") && (pathname === href || pathname.startsWith(`${href}/`));
          const destination = sport && ["/stats", "/feed", "/games", "/top"].includes(href) ? `${href}?sport=${encodeURIComponent(sport)}` : href;
          return <Link key={href} href={destination} prefetch={false} aria-current={active ? "page" : undefined}>{label}{href === "/top" && savedCount !== undefined ? <span className={styles.count}>{savedCount}</span> : null}</Link>;
        })}
      </nav>
      <div className={styles.theme}><ThemeControl /></div>
      <Link href="/account" prefetch={false} className={styles.account} aria-current={pathname === "/account" ? "page" : undefined}>Your account <span aria-hidden="true">↗</span></Link>
    </div>
  </header>;
}
