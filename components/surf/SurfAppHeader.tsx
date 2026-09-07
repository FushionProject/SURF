"use client";
import Link from "next/link";
import { ThemeControl } from "@/components/surf-editorial/ThemeControl";
import { Brand } from "@/components/surf-editorial/SurfEditorial";
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
        <ThemeControl />
        <Link href="/games" className="bn-account-back">
          Back to the board ↗
        </Link>
      </div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}
