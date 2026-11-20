"use client";
import { useState } from "react";
import { Package } from "lucide-react";
import { useAuth, useData } from "@/components/auth-provider";
import { Guard } from "@/components/guard";
import { Badge, Button, Empty, ErrorNote, Field, Input, ListHeader, ListTable, Loading, Modal, Select, Td, Th, useToast } from "@/components/ui";
import { GST_RATES, SPECIAL_RATES } from "@/lib/gst";
import { money } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Item } from "@/lib/types";

function ItemModal({ existing, onClose, onSaved }: { existing?: Item; onClose: () => void; onSaved: (msg: string) => void }) {
  const { api } = useAuth();
  const [f, setF] = useState({ name: existing?.name ?? "", hsn: existing?.hsn ?? "", rate: existing?.rate ?? 0, gstRate: existing?.gstRate ?? 18, kind: existing?.kind ?? "goods" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={existing ? "Edit item" : "New item"}
      footer={<>
        {existing && <Button variant="danger" className="mr-auto" onClick={async () => {
          if (!confirm(`Delete ${existing.name}?`)) return;
          try { await api(`/api/items/${existing.id}`, { method: "DELETE" }); onSaved("Item deleted"); } catch (e) { setError((e as Error).message); }
        }}>Delete</Button>}
        <Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} form="item-form">Save</Button>
      </>}>
      <form id="item-form" className="grid grid-cols-2 gap-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try { await api(existing ? `/api/items/${existing.id}` : "/api/items", { method: existing ? "PATCH" : "POST", json: f }); onSaved("Item saved"); }
        catch (err) { setError((err as Error).message); setBusy(false); }
      }}>
        <div className="col-span-2"><ErrorNote message={error} /></div>
        <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Item["kind"] })}><option value="goods">Goods (HSN)</option><option value="service">Service (SAC)</option></Select></Field>
        <Field label="Name*"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={f.kind === "goods" ? "HSN code" : "SAC code"}><Input value={f.hsn} onChange={(e) => setF({ ...f, hsn: e.target.value })} /></Field>
        <Field label="Selling rate (₹)"><Input type="number" min="0" step="0.01" value={f.rate} onChange={(e) => setF({ ...f, rate: Number(e.target.value) })} /></Field>
        <Field label="GST rate"><Select value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: Number(e.target.value) })}>{[...GST_RATES, ...SPECIAL_RATES].map((r) => <option key={r} value={r}>{r}%{r === 40 ? " (sin / luxury)" : r === 3 ? " (gold, jewellery)" : r === 0.25 ? " (rough diamonds)" : ""}</option>)}</Select></Field>
      </form>
    </Modal>
  );
}

export default function ItemsPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useData<Item[]>("/api/items");
  const [view, setView] = useState<"all" | "goods" | "service">("all");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const { toast, toastNode } = useToast();
  const writable = !!user && can(user.role, "party:write");
  const rows = (data ?? []).filter((i) => view === "all" || i.kind === view);
  return (
    <Guard need="books:read">
      <ListHeader views={[{ value: "all", label: "All Items" }, { value: "goods", label: "Goods" }, { value: "service", label: "Services" }]} view={view} onView={setView}
        menu={writable ? [{ label: "New item", onClick: () => setEditing("new") }] : undefined} />
      <div className="flex items-center justify-between border-b border-line bg-canvas px-6 py-2.5 text-sm">
        <span className="text-muted">Saved items fill in the HSN/SAC code, rate and GST automatically on invoices.</span>
        {writable && <Button size="sm" variant="primary" onClick={() => setEditing("new")}>+ New</Button>}
      </div>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : !rows.length ? <Empty icon={Package} title={view === "all" ? "Save the things you sell" : `No ${view === "goods" ? "goods" : "services"} yet`} detail="Save an item once with its HSN/SAC code, rate and GST, and it fills in on every invoice." /> : (
        <ListTable head={<tr><Th>Name</Th><Th>Type</Th><Th>HSN/SAC</Th><Th>GST</Th><Th right>Rate</Th></tr>}>
          {rows.map((i) => (
            <tr key={i.id} className={writable ? "cursor-pointer" : ""} onClick={() => writable && setEditing(i)}>
              <Td className="font-medium text-accent">{i.name}</Td>
              <Td><Badge tone={i.kind === "goods" ? "blue" : "gray"}>{i.kind === "goods" ? "Goods" : "Service"}</Badge></Td>
              <Td className="font-mono text-xs">{i.hsn ?? "—"}</Td>
              <Td>{i.gstRate}%</Td>
              <Td right>{money(i.rate)}</Td>
            </tr>
          ))}
        </ListTable>
      )}
      {editing && <ItemModal existing={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); toast(m); reload(); }} />}
      {toastNode}
    </Guard>
  );
}
