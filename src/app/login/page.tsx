"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { clientAuth } from "@/lib/client/firebase";
import { ROLES, type Role } from "@/lib/types";

export default function LoginPage() {
  const { mode, status, signInDemo, configError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (status === "ready") router.replace("/");
    if (status === "needs_org") router.replace("/onboarding");
  }, [status, router]);

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message.replace("Firebase: ", "")); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <a href="/welcome" className="mb-4 inline-block text-sm text-muted hover:text-ink">← About Ledgerly</a>
        <div className="mb-6 flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-accent font-bold text-on-accent">L</div>
          <div>
            <div className="font-semibold">Ledgerly</div>
            <div className="text-xs text-muted">Banking, bills, GST invoices and live books</div>
          </div>
        </div>
        <Card className="p-6">
          {status === "config_error" ? (
            <div>
              <h1 className="text-lg font-semibold text-out">Setup problem</h1>
              <p className="mt-2 text-sm">{configError}</p>
              <p className="mt-2 text-sm text-muted">Sign-in is disabled until the server and browser Firebase settings are both complete. See the README section “Switch to Firebase”.</p>
            </div>
          ) : mode === "demo" ? (
            <>
              <h1 className="text-lg font-semibold">Try the demo</h1>
              <p className="mt-1 text-sm text-muted">
                Firebase keys are not set, so the app runs on sample data for “Demo Traders Pvt Ltd”. Pick a role to see what each person can do.
              </p>
              <div className="mt-5 space-y-2">
                {ROLES.map((r) => (
                  <button key={r.value} onClick={() => signInDemo(r.value as Role)} className="w-full rounded-lg border border-line px-4 py-3 text-left hover:border-accent hover:bg-accent-soft">
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-xs text-muted">{r.description}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void wrap(() => (isSignup ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(clientAuth(), email, password)); }}>
              <h1 className="text-lg font-semibold">{isSignup ? "Create your account" : "Sign in"}</h1>
              <div className="mt-4 space-y-3">
                <ErrorNote message={error} />
                {info && <div className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{info}</div>}
                <Field label="Work email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
                <Field label="Password"><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? "new-password" : "current-password"} /></Field>
                <Button variant="primary" className="w-full" loading={busy}>{isSignup ? "Create account" : "Sign in"}</Button>
                <Button type="button" className="w-full" onClick={() => void wrap(() => signInWithPopup(clientAuth(), new GoogleAuthProvider()))}>Continue with Google</Button>
                <div className="flex justify-between text-sm">
                  <button type="button" className="text-accent" onClick={() => setIsSignup(!isSignup)}>{isSignup ? "Have an account? Sign in" : "New here? Create an account"}</button>
                  {!isSignup && (
                    <button type="button" className="text-muted" onClick={() => void wrap(async () => { await sendPasswordResetEmail(clientAuth(), email); setInfo("Password reset email sent."); })}>Forgot password</button>
                  )}
                </div>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
