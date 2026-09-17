import SurfEditorial from "@/components/surf-editorial/SurfEditorial";

// Signals is no longer walled off. `/api/surf-feed` hands free viewers the
// featured game in full and the count of what Surf Pro adds; the editorial
// component surfaces that lock. The component renders its own header.
export default function Page() {
  return <SurfEditorial view="signals" />;
}
