import type { SurfSignalDetection } from "./types";
import type { SurfSportKey } from "./sports";

function rangeStraddles(low: number | undefined, high: number | undefined, value: number): boolean {
  return low != null && high != null && low <= value && high >= value && low !== high;
}

export function isUsefulFeedSnapshot(
  detection: SurfSignalDetection,
  sportKey: SurfSportKey,
): boolean {
  if (detection.type === "RUN_LINE_PRICE_CONFLICT") return detection.booksInSample >= 2;
  if (detection.type !== "BOOK_DISAGREEMENT" || detection.booksInSample < 4) return false;

  if (sportKey === "baseball_mlb") {
    return detection.market === "spreads" ? detection.range >= 1 : detection.range >= 1.5;
  }
  if (detection.range >= 1.5) return true;
  if (
    (sportKey !== "americanfootball_nfl" && sportKey !== "americanfootball_nfl_preseason") ||
    detection.market !== "spreads"
  ) {
    return false;
  }

  const favoriteFlip =
    detection.lowPoint != null &&
    detection.highPoint != null &&
    detection.lowPoint < 0 &&
    detection.highPoint > 0;
  const keyNumberSplit = [3, 7].some(
    (key) =>
      rangeStraddles(detection.lowPoint, detection.highPoint, key) ||
      rangeStraddles(detection.lowPoint, detection.highPoint, -key),
  );
  return favoriteFlip || keyNumberSplit;
}

export function usefulFeedSnapshotDetections(
  detections: SurfSignalDetection[],
  sportKey: SurfSportKey,
): SurfSignalDetection[] {
  return detections.filter((detection) => isUsefulFeedSnapshot(detection, sportKey));
}
