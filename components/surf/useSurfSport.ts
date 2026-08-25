"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_SURF_SPORT_KEY,
  isSurfVisibleSportKey,
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
      const initial = isSurfVisibleSportKey(requested)
        ? requested
        : isSurfVisibleSportKey(saved)
          ? saved
          : DEFAULT_SURF_SPORT_KEY;

      window.localStorage.setItem(SPORT_STORAGE_KEY, initial);
      if (requested !== initial) {
        const url = new URL(window.location.href);
        url.searchParams.set("sport", initial);
        window.history.replaceState(null, "", url.toString());
      }
      setSport(initial);
      setSportSynced(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const selectSport = useCallback((next: SurfSportKey) => {
    const visible = isSurfVisibleSportKey(next) ? next : DEFAULT_SURF_SPORT_KEY;
    setSport(visible);
    window.localStorage.setItem(SPORT_STORAGE_KEY, visible);

    const url = new URL(window.location.href);
    url.searchParams.set("sport", visible);
    window.history.replaceState(null, "", url.toString());
  }, []);

  return { sport, sportSynced, selectSport };
}
