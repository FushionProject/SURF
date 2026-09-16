"use client";

import Link from "next/link";
import { Icon } from "./SurfEditorial";
import { SurfNavigation } from "@/components/surf/SurfNavigation";

const links = [
  { href: "/stats", label: "Spot Stats", short: "Stats", icon: "grid" },
  { href: "/feed", label: "The signals", short: "Signals", icon: "pulse" },
  { href: "/games", label: "Game briefs", short: "Briefs", icon: "grid" },
  { href: "/top", label: "My watchlist", short: "Watchlist", icon: "save" },
] as const;

export function SpotStatsHeader() {
  return <SurfNavigation />;
}

export function SpotStatsMobileNav() {
  return <nav className="bn-mobile-nav" aria-label="Mobile navigation">{links.map(link => <Link key={link.href} href={link.href} prefetch={false} aria-current={link.short === "Stats" ? "page" : undefined}><Icon name={link.icon} size={19} /><span>{link.short}</span></Link>)}</nav>;
}
