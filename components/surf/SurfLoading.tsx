export function SurfLoading({ detail = "Getting your view ready." }: { detail?: string }) {
  return <div className="surf-loading" role="status" aria-live="polite">
    <span className="surf-loading-mark" aria-hidden="true" />
    <strong>Loading</strong>
    <span>{detail}</span>
  </div>;
}
