"use client";

type Props = {
  updatedAt?: number | null;
  isSimulated?: boolean;
};

function formatUpdatedAt(ts?: number | null): string {
  if (!ts) return "";
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return "";
  return `Updated ${dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function SurfFooter({ updatedAt, isSimulated = false }: Props) {
  const label = formatUpdatedAt(updatedAt);

  return (
    <footer className="surf-shell mx-auto w-full max-w-md px-4 pb-8 pt-6">
      <div className="flex items-center justify-between rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-[color:var(--surf-ink-60)]">
          <span className="h-2 w-2 rounded-full bg-[color:var(--surf-primary)] shadow-[0_0_18px_rgba(0,229,255,0.35)]" />
          <span>{isSimulated ? "Simulated market data" : "Live market data"}</span>
        </div>

        <div className="text-xs text-[color:var(--surf-ink-45)]">{label || ""}</div>
      </div>
    </footer>
  );
}
