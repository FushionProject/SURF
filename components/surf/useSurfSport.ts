"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_SURF_SPORT_KEY,
  isSurfSportKey,
  type SurfSportKey,
} from "@/lib/surf/sports";

const SPORT_STORAGE_KEY = "surf:sport";

export function useSurfSport() {
  const [sport, setSport] = useState<SurfSportKey>(DEFAULT_SURF_SPORT_KEY);
  const [sportSynced, setSportSynced] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("sport");
      const saved = window.localStorage.getItem(SPORT_STORAGE_KEY);
      const initial = isSurfSportKey(requested)
        ? requested
        : isSurfSportKey(saved)
          ? saved
          : DEFAULT_SURF_SPORT_KEY;

      setSport(initial);
      setSportSynced(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const selectSport = useCallback((next: SurfSportKey) => {
    setSport(next);
    window.localStorage.setItem(SPORT_STORAGE_KEY, next);

    const url = new URL(window.location.href);
    url.searchParams.set("sport", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  return { sport, sportSynced, selectSport };
}
