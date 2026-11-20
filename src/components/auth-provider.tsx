"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { clientAuth, firebaseClientConfigured } from "@/lib/client/firebase";
import type { Org, Role, SessionUser } from "@/lib/types";

type Status = "loading" | "signed_out" | "needs_org" | "config_error" | "ready";
export type Features = { paymentLinks: boolean };

interface AuthCtx {
  status: Status;
  mode: "demo" | "firebase";
  user: SessionUser | null;
  org: Org | null;
  features: Features;
  configError: string | null;
  demoRole: Role;
  setDemoRole: (r: Role) => void;
  signInDemo: (r: Role) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  api: <T = unknown>(path: string, init?: RequestInit & { json?: unknown; raw?: boolean }) => Promise<T>;
}

const Ctx = createContext<AuthCtx | null>(null);
const DEMO_KEY = "ledgerly.demoRole";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const mode = firebaseClientConfigured ? "firebase" : "demo";
  const [status, setStatus] = useState<Status>("loading");
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [demoRole, setDemoRoleState] = useState<Role>("admin");
  const [demoOn, setDemoOn] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [features, setFeatures] = useState<Features>({ paymentLinks: false });
  const [configError, setConfigError] = useState<string | null>(null);

  const api = useCallback(
    async <T,>(path: string, init: RequestInit & { json?: unknown; raw?: boolean } = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      if (init.json !== undefined) headers.set("content-type", "application/json"); // FormData bodies set their own type
      if (mode === "demo") headers.set("x-demo-role", demoRole);
      else if (fbUser) headers.set("authorization", `Bearer ${await fbUser.getIdToken()}`);
      const { json, raw: _raw, ...rest } = init; // eslint-disable-line @typescript-eslint/no-unused-vars
      const res = await fetch(path, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, body.error ?? res.statusText, body.code);
      }
      if (init.raw) return res as unknown as T; // caller reads the body (files)
      return (res.headers.get("content-type")?.includes("json") ? res.json() : res.text()) as Promise<T>;
    },
    [mode, demoRole, fbUser],
  );

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: SessionUser; org: Org; features?: Features }>("/api/me");
      setUser(me.user);
      setOrg(me.org);
      setFeatures(me.features ?? { paymentLinks: false });
      setStatus("ready");
    } catch (e) {
      if (e instanceof ApiError && e.code === "no_org") setStatus("needs_org");
      else if (e instanceof ApiError && e.code === "config") { setConfigError(e.message); setStatus("config_error"); }
      else setStatus("signed_out");
    }
  }, [api]);

  // Ask the server once whether its configuration is sane (catches a half-configured Firebase deployment).
  useEffect(() => {
    fetch("/api/me").then(async (r) => {
      if (r.status === 503) {
        const b = await r.json().catch(() => ({}));
        if (b.code === "config") { setConfigError(b.error); setStatus("config_error"); }
      }
    }).catch(() => {});
  }, []);

  // Demo mode: restore the chosen role from localStorage.
  useEffect(() => {
    if (mode !== "demo") return;
    const saved = localStorage.getItem(DEMO_KEY) as Role | null;
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      setDemoRoleState(saved);
      setDemoOn(true);
    } else setStatus("signed_out");
  }, [mode]);

  // Firebase mode: follow the auth state.
  useEffect(() => {
    if (mode !== "firebase") return;
    return onAuthStateChanged(clientAuth(), (u) => {
      setFbUser(u);
      if (!u) {
        setUser(null);
        setStatus("signed_out");
      }
    });
  }, [mode]);

  useEffect(() => {
    if ((mode === "demo" && demoOn) || (mode === "firebase" && fbUser)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- show the loader while the session is (re)fetched
      setStatus("loading");
      void refresh();
    }
  }, [mode, demoOn, demoRole, fbUser, refresh]);

  const value = useMemo<AuthCtx>(
    () => ({
      status, mode, user, org, features, configError, demoRole, api, refresh,
      setDemoRole: (r) => { localStorage.setItem(DEMO_KEY, r); setDemoRoleState(r); },
      signInDemo: (r) => { localStorage.setItem(DEMO_KEY, r); setDemoRoleState(r); setDemoOn(true); },
      signOut: async () => {
        if (mode === "demo") { localStorage.removeItem(DEMO_KEY); setDemoOn(false); setUser(null); setStatus("signed_out"); }
        else await fbSignOut(clientAuth());
      },
    }),
    [status, mode, user, org, features, configError, demoRole, api, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}

/** Minimal data hook: fetches a GET endpoint and re-fetches when the role changes or reload() is called. */
export function useData<T>(path: string | null) {
  const { api, demoRole, status } = useAuth();
  // Remember which path the data belongs to, so a page never renders one report's data with another's shape.
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null; at: number | null }>({ path: null, data: null, error: null, at: null });
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path || status !== "ready") return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for a fetch started by this effect
    setLoading(true);
    api<T>(path)
      .then((d) => { if (alive) setState({ path, data: d, error: null, at: Date.now() }); })
      .catch((e: Error) => { if (alive) setState((s) => ({ path, data: s.path === path ? s.data : null, error: e.message, at: s.path === path ? s.at : null })); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [path, api, demoRole, status, tick]);
  const current = state.path === path;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: loading || !current,
    /** When the data on screen was fetched (ms since epoch). */
    updatedAt: current ? state.at : null,
    reload: () => setTick((t) => t + 1),
    setData: (fn: T | null | ((d: T | null) => T | null)) =>
      setState((s) => ({ ...s, data: typeof fn === "function" ? (fn as (d: T | null) => T | null)(s.data) : fn })),
  };
}
