"use client";
import Link from "next/link";
import { Brand } from "@/components/betnow/BetNow";
export function SurfAppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="bn-account-header">
      <div>
        <Brand />
        <Link href="/games" className="bn-account-back">
          Back to the board ↗
        </Link>
      </div>
      <h1>{title}</h1>
      <p>{subtitle.replaceAll("Surf", "BetNow")}</p>
    </header>
  );
}
