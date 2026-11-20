"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, ErrorNote, Field, Input, Textarea } from "@/components/ui";
import { isValidGstin, STATES } from "@/lib/gst";

export default function Onboarding() {
  const { status, api, refresh, signOut } = useAuth();
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [seed, setSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "ready") router.replace("/");
    if (status === "signed_out") router.replace("/login");
  }, [status, router]);

  const g = gstin.trim().toUpperCase();
  const gstError = g && !isValidGstin(g) ? "Enter a valid 15-character GSTIN" : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg p-6">
        <h1 className="text-lg font-semibold">Set up your business</h1>
        <p className="mt-1 text-sm text-muted">You will be the admin. You can invite your team and CA afterwards.</p>
        <form
          className="mt-5 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setError(null);
            try {
              await api("/api/bootstrap", { method: "POST", json: { orgName, gstin: g, address, seedDemoData: seed } });
              await refresh();
            } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
          }}
        >
          <ErrorNote message={error} />
          <Field label="Legal business name"><Input required value={orgName} onChange={(e) => setOrgName(e.target.value)} /></Field>
          <Field label="GSTIN" error={gstError} hint={isValidGstin(g) ? `State: ${STATES[g.slice(0, 2)]}` : "Your state is taken from the first two digits"}>
            <Input required value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="29ABCDE1234F1Z5" className="uppercase" />
          </Field>
          <Field label="Registered address"><Textarea value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} /> Fill with 12 months of sample data so I can explore</label>
          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" onClick={() => void signOut()}>Sign out</Button>
            <Button variant="primary" loading={busy} disabled={!!gstError || !orgName}>Create organisation</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
