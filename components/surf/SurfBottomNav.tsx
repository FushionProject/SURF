"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SurfBottomNav.module.css";

const items = [
  { label: "Home", href: "/", path: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z" },
  { label: "Spot Stats", href: "/stats", path: "M5 20V10M12 20V4M19 20v-7" },
  { label: "Signals", href: "/feed", path: "M2 12h5l3-8 4 16 3-8h5" },
  { label: "Game briefs", href: "/games", path: "M4 5h16v16H4ZM8 3v4M16 3v4M4 11h16" },
];

export function SurfBottomNav() {
  const pathname = usePathname();
  return <nav aria-label="Bottom navigation" className={styles.bar}>
    <div className={styles.inner}>
      {items.map(({ label, href, path }) => <Link key={href} href={href} prefetch={false}
        aria-current={(pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))) ? "page" : undefined}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
        <span>{label}</span>
      </Link>)}
    </div>
  </nav>;
}
