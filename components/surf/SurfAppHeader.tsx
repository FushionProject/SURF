"use client";
import { SurfNavigation } from "./SurfNavigation";
export function SurfAppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <>
    <SurfNavigation />
    <header className="bn-account-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
    </>
  );
}
