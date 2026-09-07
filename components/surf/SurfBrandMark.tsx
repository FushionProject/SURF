/** A single, clean S ribbon: no raster asset, effects, or chart motif. */
export function SurfBrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 48 54"
      fill="currentColor"
      className={className}
    >
      <path d="M41 9H24.3C14.8 9 8.4 13.6 7 20.8c-1.2 6.3 2.9 9.2 10.8 9.2h9.8c3.2 0 4.8 1.1 4.4 3.2-.5 2.5-3 3.8-7.4 3.8H7l-1.6 8H24c9.8 0 16.4-4.6 17.9-12.2 1.2-6.5-2.9-9.8-11-9.8h-9.7c-3.1 0-4.6-.9-4.2-2.8.4-2.1 2.9-3.2 7.1-3.2h15.3L41 9Z" />
    </svg>
  );
}
