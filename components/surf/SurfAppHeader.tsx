"use client";
export function SurfAppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <>
    <header className="bn-account-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
    </>
  );
}
