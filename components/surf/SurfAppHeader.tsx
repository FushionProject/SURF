"use client";

type Props = {
  title: string;
  subtitle: string;
};

export function SurfAppHeader({ title, subtitle }: Props) {
  return (
    <header className="pb-5 pt-6">
      <div>
        <div className="mb-5 flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight text-[color:var(--surf-ink-solid)]">Surf</span>
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--surf-primary)]" />
        </div>
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.04em] text-[color:var(--surf-ink-solid)]">
          {title}
        </h1>
        <p className="mt-2 max-w-sm text-[15px] leading-6 text-[color:var(--surf-ink-55)]">{subtitle}</p>
      </div>
    </header>
  );
}
