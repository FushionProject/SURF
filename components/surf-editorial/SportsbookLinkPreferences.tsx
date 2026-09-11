"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SPORTSBOOK_STATES, sportsbookStateCode } from "@/lib/surf/usStates";

const STORAGE_KEY = "surf:sportsbook-state";
const Preferences = createContext<{ state: string | null; chooseState: (value: string) => void }>({ state: null, chooseState: () => {} });

export function SportsbookLinkPreferences({ children }: { children: ReactNode }) {
  const [state, setState] = useState<string | null>(null);
  useEffect(() => {
    function readSavedState() {
      try { setState(sportsbookStateCode(window.localStorage.getItem(STORAGE_KEY)) ?? null); }
      catch { /* A state can still be chosen for this visit if storage is blocked. */ }
    }
    const timer = window.setTimeout(readSavedState, 0);
    function sync(event: StorageEvent) { if (event.key === STORAGE_KEY || event.key === null) readSavedState(); }
    window.addEventListener("storage", sync);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sync); };
  }, []);
  function chooseState(value: string) {
    const next = sportsbookStateCode(value) ?? null;
    setState(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* Keep the explicitly selected state in memory for this visit. */ }
  }
  return <Preferences.Provider value={{ state, chooseState }}>{children}</Preferences.Provider>;
}

export function useSportsbookLinkState() { return useContext(Preferences).state; }

export function SportsbookStateSelect() {
  const { state, chooseState } = useContext(Preferences);
  return <div className="bn-book-location">
    <label>Sportsbook state
      <select aria-label="Sportsbook state" value={state ?? ""} onChange={(event) => chooseState(event.target.value)}>
        <option value="">Choose state</option>
        {SPORTSBOOK_STATES.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
      </select>
    </label>
    <span>For game links only · availability varies by state</span>
  </div>;
}
