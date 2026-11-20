"use client";
import { useCallback, useSyncExternalStore } from "react";

/** Per-browser display preferences: theme and table density. */
export type Theme = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";

import { PREF_KEYS as KEYS } from "./prefs-boot";
const DEFAULTS = { theme: "dark" as Theme, density: "comfortable" as Density };
const EVT = "ledgerly-prefs";

function read<K extends keyof typeof KEYS>(k: K): (typeof DEFAULTS)[K] {
  try {
    return (localStorage.getItem(KEYS[k]) as (typeof DEFAULTS)[K]) || DEFAULTS[k];
  } catch {
    return DEFAULTS[k];
  }
}

/** Applies the stored preferences to <html>. Also inlined in the root layout so the first paint is right. */
export function applyPrefs() {
  const t = read("theme");
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.density = read("density");
}


function subscribe(cb: () => void) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => { applyPrefs(); cb(); };
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", onSystem);
  mq.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", onSystem);
    mq.removeEventListener("change", onSystem);
  };
}

export function usePref<K extends keyof typeof KEYS>(k: K) {
  const value = useSyncExternalStore(subscribe, () => read(k), () => DEFAULTS[k]);
  const set = useCallback((v: (typeof DEFAULTS)[K]) => {
    try { localStorage.setItem(KEYS[k], v); } catch { /* private mode: still applies for this page */ }
    applyPrefs();
    window.dispatchEvent(new Event(EVT));
  }, [k]);
  return [value, set] as const;
}
