"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, useData } from "@/components/auth-provider";
import { Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Tabs, Td, Textarea, Th, useToast } from "@/components/ui";
import { fmtDate, today } from "@/lib/format";
import { previewInvoiceNumber } from "@/components/invoice-form";
import { isValidGstin } from "@/lib/gst";
import { can } from "@/lib/permissions";
import { ROLES, type AuditEvent, type Member, type Org, type Role } from "@/lib/types";

function OrgForm() {
  const { api, org, user, refresh } = useAuth();
  const [f, setF] = useState<Org | null>(org);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, toastNode } = useToast();
  if (!f) return null;
  const admin = !!user && can(user.role, "org:manage");
  return (
    <Card className="max-w-2xl p-5">
      <form className="grid grid-cols-2 gap-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          await api("/api/org", { method: "PATCH", json: { name: f.name, gstin: f.gstin, address: f.address, approvalThreshold: Number(f.approvalThreshold), invoicePrefix: f.invoicePrefix } });
          await refresh(); toast("Settings saved");
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <div className="col-span-2"><ErrorNote message={error} /></div>
        <Field label="Business name" className="col-span-2"><Input disabled={!admin} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="GSTIN" error={isValidGstin(f.gstin) ? undefined : "Invalid GSTIN"}><Input disabled={!admin} value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} /></Field>
        <Field label="Invoice prefix" hint={`{FY} becomes the financial year and restarts numbering every 1 April. Next: ${previewInvoiceNumber(f, today())}`}><Input disabled={!admin} value={f.invoicePrefix} onChange={(e) => setF({ ...f, invoicePrefix: e.target.value })} /></Field>
        <Field label="Address" className="col-span-2"><Textarea disabled={!admin} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Second approval threshold (₹)" hint="Bills at or above this need an admin's final approval" className="col-span-2">
          <Input disabled={!admin} type="number" min="0" value={f.approvalThreshold} onChange={(e) => setF({ ...f, approvalThreshold: Number(e.target.value) })} />
        </Field>
        {admin && <div className="col-span-2 flex justify-end"><Button variant="primary" loading={busy}>Save</Button></div>}
      </form>
      {toastNode}
    </Card>
  );
}

function Team() {
  const { api, user, mode } = useAuth();
  const { data, error, reload } = useData<Member[]>("/api/team");
  const [invite, setInvite] = useState(false);
  const [f, setF] = useState({ name: "", email: "", role: "finance" as Role });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const admin = !!user && can(user.role, "org:manage");
  const [setupLink, setSetupLink] = useState<string | null>(null);
  const removeMember = async (m: Member) => {
    if (!confirm(`Remove ${m.name} from the organisation?`)) return;
    setErr(null);
    try { await api(`/api/team/${m.id}`, { method: "DELETE" }); reload(); } catch (e) { setErr((e as Error).message); }
  };
  const changeRole = async (id: string, role: Role) => {
    setErr(null);
    try { await api(`/api/team/${id}`, { method: "PATCH", json: { role } }); reload(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex justify-between">
        <p className="text-sm text-muted">Give your CA the Accountant role: read-only books and exports.</p>
        {admin && <Button variant="primary" onClick={() => setInvite(true)}>Invite</Button>}
      </div>
      <ErrorNote message={error ?? err} />
      {setupLink && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
          <div className="font-medium">Send this one-time link to your teammate so they can set a password:</div>
          <div className="mt-1 flex gap-2"><input readOnly value={setupLink} className="h-8 flex-1 rounded border border-line bg-surface px-2 text-xs" /><Button size="sm" onClick={() => void navigator.clipboard.writeText(setupLink)}>Copy</Button></div>
        </div>
      )}
      <Card className="overflow-hidden">
        {!data ? <Loading /> : (
          <table className="w-full">
            <thead className="border-b border-line bg-canvas/60"><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th>{admin && <Th />}</tr></thead>
            <tbody className="divide-y divide-line">
              {data.map((m) => (
                <tr key={m.id}>
                  <Td className="font-medium">{m.name}{m.id === user?.uid && <span className="ml-1 text-xs text-muted">(you)</span>}</Td>
                  <Td className="text-muted">{m.email}</Td>
                  <Td>{admin ? <Select value={m.role} onChange={(e) => changeRole(m.id, e.target.value as Role)} className="w-44!">{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select> : ROLES.find((r) => r.value === m.role)?.label}</Td>
                  {admin && <Td right>{m.id !== user?.uid && <button onClick={() => removeMember(m)} className="text-sm text-out hover:underline">Remove</button>}</Td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card className="mt-4 p-4">
        <h3 className="text-sm font-semibold">What each role can do</h3>
        <ul className="mt-2 space-y-1 text-sm">{ROLES.map((r) => <li key={r.value}><span className="font-medium">{r.label}:</span> <span className="text-muted">{r.description}</span></li>)}</ul>
      </Card>
      <Modal open={invite} onClose={() => setInvite(false)} title="Invite a teammate" footer={<><Button onClick={() => setInvite(false)}>Cancel</Button><Button variant="primary" loading={busy} form="invite-form">Add</Button></>}>
        <form id="invite-form" className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { const r = await api<Member & { setupLink?: string }>("/api/team", { method: "POST", json: f }); setInvite(false); setSetupLink(r.setupLink ?? null); reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
        }}>
          <ErrorNote message={err} />
          <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email" hint={mode === "firebase" ? "You'll get a link to share so they can set their password" : "Demo mode: the member is added to the list only"}><Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
        </form>
      </Modal>
    </div>
  );
}

function AuditLog() {
  const { data, error } = useData<AuditEvent[]>("/api/audit");
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;
  return (
    <Card className="overflow-hidden">
      {data.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted">No activity yet. Every create, approval, payment and export is recorded here.</p> : (
        <table className="w-full">
          <thead className="border-b border-line bg-canvas/60"><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Target</Th><Th>Detail</Th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.map((e) => <tr key={e.id}><Td className="whitespace-nowrap text-muted">{fmtDate(e.at)} {new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</Td><Td>{e.actorName}</Td><Td><code className="text-xs">{e.action}</code></Td><Td>{e.target}</Td><Td className="text-muted">{e.detail}</Td></tr>)}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function OrgFormKeyed() {
  const { org } = useAuth();
  // Re-mount the form when the saved org changes so it starts from fresh values.
  return <OrgForm key={JSON.stringify(org)} />;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "org");
  const books = !!user && can(user.role, "books:read");
  return (
    <div className="px-6 py-5">
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "org", label: "Business" }, { value: "team", label: "Team & roles" }, ...(books ? [{ value: "audit", label: "Audit log" }] : [])]} />
      {tab === "org" && <OrgFormKeyed />}
      {tab === "team" && <Team />}
      {tab === "audit" && books && <AuditLog />}
    </div>
  );
}
