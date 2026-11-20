"use client";
import { useState } from "react";
import { Play } from "lucide-react";
import { useAuth, useData } from "@/components/auth-provider";
import { Guard } from "@/components/guard";
import { LineItemsEditor, emptyLine } from "@/components/line-items";
import { Badge, Button, Empty, ErrorNote, Field, Input, ListHeader, ListTable, Loading, Modal, Select, Td, Th, useToast } from "@/components/ui";
import { fmtDate, money, today } from "@/lib/format";
import { computeTax } from "@/lib/gst";
import { can } from "@/lib/permissions";
import type { Item, LineItem, Party, RecurringProfile } from "@/lib/types";

const FREQ = { weekly: "Every week", monthly: "Every month", quarterly: "Every 3 months", yearly: "Every year" } as const;

function ProfileModal({ existing, onClose, onSaved }: { existing?: RecurringProfile; onClose: () => void; onSaved: () => void }) {
  const { api, org } = useAuth();
  const { data: parties } = useData<Party[]>("/api/parties");
  const { data: catalog } = useData<Item[]>("/api/items");
  const customers = (parties ?? []).filter((p) => p.type === "customer");
  const [f, setF] = useState({
    name: existing?.name ?? "", customerId: existing?.customerId ?? "", frequency: existing?.frequency ?? "monthly",
    paymentTermsDays: existing?.paymentTermsDays ?? 15, nextDate: existing?.nextDate ?? today(), endDate: existing?.endDate ?? "",
    autoSend: existing?.autoSend ?? true, active: existing?.active ?? true,
  });
  const [items, setItems] = useState<LineItem[]>(existing?.items ?? [emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customer = customers.find((c) => c.id === f.customerId);
  return (
    <Modal open wide onClose={onClose} title={existing ? "Edit recurring invoice" : "New recurring invoice"}
      footer={<>
        {existing && <Button variant="danger" className="mr-auto" onClick={async () => {
          if (!confirm("Delete this recurring profile? Invoices already created are kept.")) return;
          try { await api(`/api/recurring/${existing.id}`, { method: "DELETE" }); onSaved(); } catch (err) { setError((err as Error).message); }
        }}>Delete</Button>}
        <Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} form="rec-form">Save</Button></>}>
      <form id="rec-form" className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          await api(existing ? `/api/recurring/${existing.id}` : "/api/recurring", { method: existing ? "PATCH" : "POST", json: { ...f, items } });
          onSaved();
        } catch (err) { setError((err as Error).message); setBusy(false); }
      }}>
        <ErrorNote message={error} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Profile name*" className="md:col-span-2"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Monthly retainer – Kaveri Foods" /></Field>
          <Field label="Customer*"><Select required value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}><option value="">Select</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Repeat"><Select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as RecurringProfile["frequency"] })}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Next invoice date*"><Input type="date" required value={f.nextDate} onChange={(e) => setF({ ...f, nextDate: e.target.value })} /></Field>
          <Field label="Ends on" hint="Leave blank to never end"><Input type="date" value={f.endDate} min={f.nextDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
          <Field label="Payment terms (days)"><Input type="number" min={0} max={180} value={f.paymentTermsDays} onChange={(e) => setF({ ...f, paymentTermsDays: Number(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={f.autoSend} onChange={(e) => setF({ ...f, autoSend: e.target.checked })} />Send automatically (else save as draft)</label>
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active</label>
        </div>
        <LineItemsEditor showHsn catalog={catalog ?? []} items={items} onChange={setItems} supplierState={org?.stateCode ?? ""} placeOfSupply={customer?.stateCode ?? org?.stateCode ?? ""} date={today()} roundOff={org?.roundOff !== false} />
      </form>
    </Modal>
  );
}

export default function RecurringPage() {
  const { api, user, org } = useAuth();
  const { data, error, loading, reload } = useData<RecurringProfile[]>("/api/recurring");
  const { data: parties } = useData<Party[]>("/api/parties");
  const [view, setView] = useState("all");
  const [editing, setEditing] = useState<RecurringProfile | "new" | null>(null);
  const [running, setRunning] = useState(false);
  const { toast, toastNode } = useToast();
  const writable = !!user && can(user.role, "invoice:create");
  const rows = (data ?? []).filter((p) => view === "all" || (view === "active" ? p.active : !p.active));
  const stateOf = (id: string) => parties?.find((p) => p.id === id)?.stateCode ?? org?.stateCode ?? "";

  const runNow = async () => {
    setRunning(true);
    try { const r = await api<{ created: number }>("/api/recurring/run", { method: "POST", json: {} }); toast(r.created ? `${r.created} invoice(s) created` : "Nothing due today"); reload(); }
    catch (e) { toast((e as Error).message); } finally { setRunning(false); }
  };

  return (
    <Guard need="books:read">
      <ListHeader views={[{ value: "all", label: "All recurring invoices" }, { value: "active", label: "Active" }, { value: "stopped", label: "Stopped" }]} view={view} onView={setView}
        menu={writable ? [{ label: "New recurring invoice", onClick: () => setEditing("new") }] : undefined} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-6 py-2.5 text-sm">
        <span className="text-muted">Invoices are created automatically every day (Vercel Cron at 6:00 am IST). You can also run due profiles now.</span>
        {writable && <div className="flex gap-2"><Button size="sm" loading={running} onClick={runNow}><Play className="size-3.5" />Run due now</Button><Button size="sm" variant="primary" onClick={() => setEditing("new")}>+ New</Button></div>}
      </div>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : !rows.length ? <Empty title="No recurring invoices" detail="Set one up for retainers, rent or subscriptions you bill every period." /> : (
        <ListTable head={<tr><Th>Profile</Th><Th>Customer</Th><Th>Frequency</Th><Th>Next Invoice</Th><Th>Mode</Th><Th>Status</Th><Th right>Amount</Th></tr>}>
          {rows.map((p) => (
            <tr key={p.id} className={writable ? "cursor-pointer" : ""} onClick={() => writable && setEditing(p)}>
              <Td className="font-medium text-accent">{p.name}</Td>
              <Td>{p.customerName}</Td>
              <Td className="text-muted">{FREQ[p.frequency]}</Td>
              <Td>{p.active ? fmtDate(p.nextDate) : "—"}</Td>
              <Td className="text-muted">{p.autoSend ? "Send automatically" : "Save as draft"}</Td>
              <Td>{p.active ? <Badge tone="green">Active</Badge> : <Badge>Stopped</Badge>}</Td>
              <Td right>{money(computeTax(p.items, org?.stateCode ?? "", stateOf(p.customerId)).total)}</Td>
            </tr>
          ))}
        </ListTable>
      )}
      {editing && <ProfileModal existing={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Saved"); reload(); }} />}
      {toastNode}
    </Guard>
  );
}
