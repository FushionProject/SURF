"use client";

import Link from "next/link";
import { Brand, Icon } from "./SurfEditorial";
import { ThemeControl } from "./ThemeControl";

const links = [
  { href: "/games", label: "Market board", short: "Board", icon: "grid" },
  { href: "/feed", label: "The signals", short: "Signals", icon: "pulse" },
  { href: "/stats/research", label: "Spot Stats", short: "Stats", icon: "grid" },
  { href: "/top", label: "My watchlist", short: "Watchlist", icon: "save" },
] as const;

export function SpotStatsHeader() {
  return <header className="bn-masthead"><div className="bn-header-inner">
    <Brand />
    <nav aria-label="Main navigation">{links.map(link => <Link key={link.href} href={link.href} prefetch={false} aria-current={link.short === "Stats" ? "page" : undefined}>{link.label}</Link>)}<Link href="/how-to-use" prefetch={false}>How to use Surf</Link></nav>
    <ThemeControl /><Link href="/account" className="bn-account-link" prefetch={false}>Your account <Icon name="arrow" size={16} /></Link>
  </div></header>;
}

export function SpotStatsMobileNav() {
  return <nav className="bn-mobile-nav" aria-label="Mobile navigation">{links.map(link => <Link key={link.href} href={link.href} prefetch={false} aria-current={link.short === "Stats" ? "page" : undefined}><Icon name={link.icon} size={19} /><span>{link.short}</span></Link>)}</nav>;
}
