type Props = {
  source: "demo" | "fallback";
  notice?: string;
};

export function DemoDataNotice({ source, notice }: Props) {
  return (
    <div className="mb-4 rounded-[var(--surf-radius-inner)] border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-xs text-amber-50/85">
      <div className="font-semibold tracking-wide text-amber-200">Simulated Data</div>
      <p className="mt-1 leading-5">
        {source === "fallback" ? "Live data was unavailable, so development fallback data is shown. " : "Demo mode is active. "}
        {notice ?? "Odds, prices, and market movements are simulated and are not live or verified."}
      </p>
    </div>
  );
}
