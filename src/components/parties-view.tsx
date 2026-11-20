"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Store } from "lucide-react";
import { useAuth, useData } from "./auth-provider";
import { Money, Sparkline, Term } from "./finance-ui";
import { Badge, Button, Empty, ErrorNote, Field, Input, ListHeader, ListTable, Loading, Modal, Select, Td, Th, useToast } from "./ui";
import { STATES, isValidGstin } from "@/lib/gst";
import { addMonths, thisMonth } from "@/lib/format";
import { can } from "@/lib/permissions";
import { billBalance, invoiceBalance, type Bill, type Invoice, type Party } from "@/lib/types";

export function PartyModal({ type, existing, onClose, onSaved }: { type: Party["type"]; existing?: Party; onClose: () => void; onSaved: (p: Party) => void }) {
  const { api, org } = useAuth();
  const [f, setF] = useState({ name: existing?.name ?? "", gstin: existing?.gstin ?? "", stateCode: existing?.stateCode ?? org?.stateCode ?? "29", email: existing?.email ?? "", phone: existing?.phone ?? "", pan: existing?.pan ?? "", msme: existing?.msme ?? "", udyam: existing?.udyam ?? "" });
  const [agreement, setAgreement] = useState(Boolean(existing?.msmeAgreement));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const g = f.gstin.trim().toUpperCase();
  const gstOk = !g || isValidGstin(g);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal open onClose={onClose} title={`${existing ? "Edit" : "New"} ${type === "customer" ? "Customer" : "Vendor"}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!gstOk} form="party-form">Save</Button></>}>
      <form id="party-form" className="grid grid-cols-2 gap-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try { onSaved(existing ? await api<Party>(`/api/parties/${existing.id}`, { method: "PATCH", json: { ...f, gstin: g, msmeAgreement: agreement } }) : await api<Party>("/api/parties", { method: "POST", json: { ...f, type, gstin: g, msmeAgreement: agreement } })); }
        catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <div className="col-span-2"><ErrorNote message={error} /></div>
        <Field label={type === "customer" ? "Customer display name*" : "Vendor display name*"} className="col-span-2"><Input required value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="GSTIN" error={gstOk ? undefined : "Invalid GSTIN"} hint={g && gstOk ? `State: ${STATES[g.slice(0, 2)]}` : "Leave blank if unregistered"}>
          <Input value={f.gstin} onChange={(e) => set("gstin", e.target.value)} className="uppercase" />
        </Field>
        {!g ? <Field label="Place of supply"><Select value={f.stateCode} onChange={(e) => set("stateCode", e.target.value)}>{Object.entries(STATES).map(([c, n]) => <option key={c} value={c}>[{c}] {n}</option>)}</Select></Field> : <div />}
        <Field label="PAN"><Input value={f.pan} onChange={(e) => set("pan", e.target.value)} className="uppercase" /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        {type === "vendor" && (
          <fieldset className="col-span-2 mt-1 grid grid-cols-2 gap-3 rounded-lg border border-line p-3">
            <legend className="px-1 text-xs font-medium text-muted">MSME (Udyam) status</legend>
            <Field label="Enterprise type" hint="Micro and small vendors must be paid within 15 or 45 days (Sec 43B(h))">
              <Select value={f.msme} onChange={(e) => set("msme", e.target.value)}>
                <option value="">Not MSME / not registered</option>
                <option value="micro">Micro</option>
                <option value="small">Small</option>
                <option value="medium">Medium (rule does not apply)</option>
              </Select>
            </Field>
            <Field label="Udyam number" hint="UDYAM-XX-00-0000000"><Input value={f.udyam} disabled={!f.msme} onChange={(e) => set("udyam", e.target.value)} className="uppercase" /></Field>
            {(f.msme === "micro" || f.msme === "small") && (
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={agreement} onChange={(e) => setAgreement(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                We have a written agreement with this vendor (allows up to 45 days instead of 15)
              </label>
            )}
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

/** Customers or Vendors list, with outstanding receivables / payables per party. */
export function PartiesView({ type }: { type: Party["type"] }) {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const base = type === "customer" ? "/customers" : "/vendors";
  const { data, error, loading, setData } = useData<Party[]>("/api/parties");
  const { data: invoices } = useData<Invoice[]>(type === "customer" ? "/api/invoices" : null);
  const { data: bills } = useData<Bill[]>(type === "vendor" ? "/api/bills" : null);
  const [view, setView] = useState<"all" | "registered" | "unregistered">("all");
  const [q, setQ] = useState("");
  const newOpen = params.get("new") === "1";
  const { toast, toastNode } = useToast();

  const owed = useMemo(() => {
    const m = new Map<string, number>();
    if (type === "customer") for (const i of invoices ?? []) if (i.status === "sent") m.set(i.customerId, (m.get(i.customerId) ?? 0) + invoiceBalance(i));
    if (type === "vendor") for (const b of bills ?? []) if (b.status === "approved") m.set(b.vendorId, (m.get(b.vendorId) ?? 0) + billBalance(b));
    return m;
  }, [invoices, bills, type]);
  /** Six-month trend of what each party was invoiced / billed, for the sparkline column. */
  const trend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, k) => addMonths(thisMonth() + "-01", k - 5).slice(0, 7));
    const m = new Map<string, number[]>();
    const add = (id: string, date: string, amt: number) => {
      const at = months.indexOf(date.slice(0, 7));
      if (at < 0) return;
      const arr = m.get(id) ?? Array(6).fill(0);
      arr[at] += amt;
      m.set(id, arr);
    };
    for (const i of invoices ?? []) if (i.status !== "draft" && i.status !== "void") add(i.customerId, i.issueDate, i.total);
    for (const b of bills ?? []) if (b.status !== "rejected") add(b.vendorId, b.billDate, b.total);
    return m;
  }, [invoices, bills]);
  const rows = (data ?? []).filter((p) => p.type === type && (view === "all" || (view === "registered" ? !!p.gstin : !p.gstin)) && (!q || `${p.name} ${p.gstin ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const label = type === "customer" ? "Customers" : "Vendors";

  return (
    <div>
      <ListHeader views={[{ value: "all", label: `All ${label}` }, { value: "registered", label: "GST Registered" }, { value: "unregistered", label: "Unregistered" }]}
        view={view} onView={setView} newHref={user && can(user.role, "party:write") ? `${base}?new=1` : undefined} />
      <div className="border-b border-line bg-canvas px-6 py-2"><Input placeholder={`Search ${label.toLowerCase()} by name or GSTIN`} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm bg-surface" /></div>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : rows.length === 0 ? (
        q || view !== "all"
          ? <Empty title={`No ${label.toLowerCase()} match`} detail="Try another name or clear the filter." action={{ label: "Clear filters", onClick: () => { setQ(""); setView("all"); } }} />
          : <Empty icon={type === "customer" ? Users : Store} title={`Add your first ${type}`}
              detail={type === "customer" ? "Save a customer once, with their GSTIN, and every invoice fills in their address and the right GST split." : "Save vendors with their GSTIN so bills claim input tax credit correctly."}
              action={user && can(user.role, "party:write") ? { label: `New ${type}`, href: `${base}?new=1` } : undefined} />
      ) : (
        <ListTable head={<tr><Th>Name</Th><Th className="hidden sm:table-cell">GSTIN</Th><Th className="hidden xl:table-cell">State</Th><Th className="hidden 2xl:table-cell">Email</Th><Th className="hidden lg:table-cell">Phone</Th><Th className="hidden lg:table-cell">Last 6 months</Th><Th right>{type === "customer" ? <Term align="right">To receive</Term> : <Term align="right">To pay</Term>}</Th></tr>}>
          {rows.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium text-accent"><Link href={`${base}/${p.id}`}>{p.name}</Link>{(p.msme === "micro" || p.msme === "small") && <span className="ml-1.5" title={`${p.msme} enterprise${p.udyam ? ` · ${p.udyam}` : ""}: pay within ${p.msmeAgreement ? "45" : "15"} days (Sec 43B(h))`}><Badge tone="amber">MSME</Badge></span>}</Td>
              <Td className="hidden sm:table-cell">{p.gstin ? <span className="font-mono text-xs">{p.gstin}</span> : <Badge>Unregistered</Badge>}</Td>
              <Td className="hidden text-muted xl:table-cell">{STATES[p.stateCode]}</Td>
              <Td className="hidden max-w-56 truncate text-muted 2xl:table-cell">{p.email ?? "—"}</Td>
              <Td className="hidden whitespace-nowrap text-muted lg:table-cell">{p.phone ?? "—"}</Td>
              <Td className="hidden lg:table-cell"><Sparkline values={trend.get(p.id) ?? []} color={type === "customer" ? "var(--chart-in)" : "var(--chart-out)"} label={`${type === "customer" ? "Invoiced" : "Billed"} per month, last 6 months`} /></Td>
              <Td right><Money value={owed.get(p.id) ?? 0} className={(owed.get(p.id) ?? 0) === 0 ? "font-normal text-muted" : "font-medium"} /></Td>
            </tr>
          ))}
        </ListTable>
      )}
      {newOpen && <PartyModal type={type} onClose={() => router.replace(base)} onSaved={(p) => { setData((d) => [...(d ?? []), p]); router.replace(base); toast(`${p.name} added`); }} />}
      {toastNode}
    </div>
  );
}
