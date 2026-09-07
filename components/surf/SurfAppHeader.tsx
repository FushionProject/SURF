"use client";
import Link from "next/link";
import { Brand } from "@/components/bestbet/BestBet";
export function SurfAppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="bb-account-header">
      <div>
        <Brand />
        <Link href="/games" className="bb-account-back">
          Back to the board ↗
        </Link>
      </div>
      <h1>{title}</h1>
      <p>{subtitle.replaceAll("Surf", "BestBet")}</p>
    </header>
  );
}
