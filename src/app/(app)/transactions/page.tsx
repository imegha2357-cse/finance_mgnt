"use client";
import { useMemo, useState } from "react";
import { Landmark } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Paperclip, Pencil, Plus, Sparkles } from "lucide-react";
import { useAuth, useData } from "@/components/auth-provider";
import { Badge, Button, Card, Drawer, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Td, Textarea, Th, useToast } from "@/components/ui";
import { ACCOUNTS, EXPENSE_ACCOUNTS, INCOME_ACCOUNTS, accountName, suggestAccount } from "@/lib/accounts";
import { fmtDate, money, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Transaction } from "@/lib/types";

const SOURCE_LABEL = { bank: "Bank", card: "Card", claim: "Claim" } as const;

function categoryLabel(t: Transaction) {
  if (t.linkedType === "bill") return "Bill payment";
  if (t.linkedType === "invoice") return "Invoice receipt";
  if (t.linkedType === "reimbursement") return "Claim reimbursement";
  return accountName(t.account);
}

function NewTransaction({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (t: Transaction) => void }) {
  const { api, user } = useAuth();
  const isEmployee = user?.role === "employee";
  const [f, setF] = useState({ date: today(), description: "", partyName: "", amount: "", direction: "out" as "in" | "out", account: "", source: (isEmployee ? "claim" : "bank") as Transaction["source"], receipt: false, notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestion = f.description.length > 2 ? suggestAccount(f.description, f.direction) : null;
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title={isEmployee ? "Submit an expense claim" : "Add a transaction"}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} form="txn-form">Save</Button></>}>
      <form id="txn-form" className="grid grid-cols-2 gap-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          const t = await api<Transaction>("/api/transactions", { method: "POST", json: { ...f, amount: Number(f.amount), account: f.account || undefined } });
          onSaved(t);
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <div className="col-span-2"><ErrorNote message={error} /></div>
        <Field label="Description" className="col-span-2"><Input required value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Uber to client office" /></Field>
        <Field label="Amount (₹)"><Input required type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
        <Field label="Date"><Input required type="date" value={f.date} max={today()} onChange={(e) => set("date", e.target.value)} /></Field>
        {!isEmployee && (
          <>
            <Field label="Direction"><Select value={f.direction} onChange={(e) => { set("direction", e.target.value); set("account", ""); }}><option value="out">Money out</option><option value="in">Money in</option></Select></Field>
            <Field label="Source"><Select value={f.source} onChange={(e) => set("source", e.target.value)}><option value="bank">Bank</option><option value="card">Card</option><option value="claim">Employee claim</option></Select></Field>
            <Field label="Category" className="col-span-2" hint={!f.account && suggestion ? `Auto: ${accountName(suggestion.account)} — ${suggestion.reason}` : undefined}>
              <Select value={f.account} onChange={(e) => set("account", e.target.value)}>
                <option value="">Auto-categorise</option>
                {(f.direction === "out" ? EXPENSE_ACCOUNTS : INCOME_ACCOUNTS).map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </Select>
            </Field>
          </>
        )}
        <Field label="Paid to / received from" className="col-span-2"><Input value={f.partyName} onChange={(e) => set("partyName", e.target.value)} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.receipt} onChange={(e) => set("receipt", e.target.checked)} /> I have attached the receipt</label>
        {isEmployee && <p className="col-span-2 text-xs text-muted">Your claim goes to finance for review before it is reimbursed and booked.</p>}
      </form>
    </Modal>
  );
}

function TxnPanel({ txn, onClose, onChange, onDeleted }: { txn: Transaction; onClose: () => void; onChange: (t: Transaction, msg?: string) => void; onDeleted: (id: string) => void }) {
  const { api, user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(txn.notes ?? "");
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ description: txn.description, amount: String(txn.amount), date: txn.date, partyName: txn.partyName ?? "" });
  const canEdit = !!user && can(user.role, "txn:edit");
  const isOwn = txn.createdBy === user?.uid;
  const linked = !!txn.linkedType;
  const coreEditable = !linked && !txn.reimbursedAt && (canEdit || (isOwn && txn.status === "pending_review"));
  const deletable = !linked && !txn.reimbursedAt && (canEdit || (isOwn && txn.status === "pending_review"));
  const patch = async (key: string, body: Record<string, unknown>, msg = "Saved") => {
    setBusy(key); setError(null);
    try { onChange(await api<Transaction>(`/api/transactions/${txn.id}`, { method: "PATCH", json: body }), msg); setEditing(false); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const upload = async (file: File) => {
    setBusy("receipt"); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      onChange(await api<Transaction>(`/api/transactions/${txn.id}/receipt`, { method: "POST", body: fd }), "Receipt attached");
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const viewReceipt = async () => {
    setError(null);
    try {
      // Authenticated download, then open it in a new tab.
      const res = await api<Response>(`/api/transactions/${txn.id}/receipt`, { raw: true });
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch (e) { setError((e as Error).message); }
  };
  const reimburse = async () => {
    setBusy("reimburse"); setError(null);
    try { onChange(await api<Transaction>(`/api/transactions/${txn.id}/reimburse`, { method: "POST", json: {} }), "Reimbursement recorded"); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!confirm("Delete this transaction? Its ledger entry is removed too.")) return;
    setBusy("delete"); setError(null);
    try { await api(`/api/transactions/${txn.id}`, { method: "DELETE" }); onDeleted(txn.id); }
    catch (e) { setError((e as Error).message); setBusy(null); }
  };
  const accounts = ACCOUNTS.filter((a) => a.type === (txn.direction === "out" ? "expense" : "income"));
  const claimState = txn.source === "claim" ? (txn.status === "pending_review" ? "Awaiting finance review" : txn.reimbursedAt ? `Reimbursed ${fmtDate(txn.reimbursedAt)}` : "Approved · to be reimbursed") : null;

  return (
    <Drawer open onClose={onClose} title={<div><div className="truncate">{txn.description}</div><div className="text-xs font-normal text-muted">{fmtDate(txn.date)} · {SOURCE_LABEL[txn.source]}</div></div>}
      footer={<>
        {deletable && <Button variant="danger" className="mr-auto" loading={busy === "delete"} onClick={remove}>Delete</Button>}
        {txn.status === "pending_review" && canEdit && <Button variant="primary" loading={busy === "post"} onClick={() => patch("post", { status: "posted" }, "Claim approved")}>Approve claim</Button>}
        {txn.source === "claim" && txn.status === "posted" && !txn.reimbursedAt && canEdit && <Button variant="primary" loading={busy === "reimburse"} onClick={reimburse}>Reimburse {money(txn.amount)}</Button>}
      </>}>
      <ErrorNote message={error} />
      {editing ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void patch("edit", { description: f.description, amount: Number(f.amount), date: f.date, partyName: f.partyName }, "Transaction updated"); }}>
          <Field label="Description"><Input required minLength={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)"><Input required type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Date"><Input required type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          </div>
          <Field label="Paid to / received from"><Input value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} /></Field>
          <div className="flex gap-2"><Button variant="primary" size="sm" loading={busy === "edit"}>Save</Button><Button size="sm" type="button" onClick={() => setEditing(false)}>Cancel</Button></div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div className={`num text-3xl font-semibold ${txn.direction === "in" ? "text-in" : ""}`}>{txn.direction === "in" ? "+" : "−"}{money(txn.amount)}</div>
            {coreEditable && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="size-3.5" />Edit</Button>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {claimState ? <Badge tone={txn.reimbursedAt ? "green" : "amber"}>{claimState}</Badge> : <Badge tone="green">Booked</Badge>}
            {txn.receipt ? <Badge tone="green">Receipt attached</Badge> : txn.direction === "out" && <Badge tone="amber">Receipt missing</Badge>}
            {txn.bankLineId && <Badge tone="blue">Reconciled</Badge>}
          </div>
        </>
      )}
      <dl className="mt-5 space-y-3 text-sm">
        {txn.partyName && !editing && <div><dt className="text-muted">Party</dt><dd>{txn.partyName}</dd></div>}
        {txn.paymentMode && <div><dt className="text-muted">Mode</dt><dd>{txn.paymentMode}{txn.reference ? ` · ${txn.reference}` : ""}</dd></div>}
        <div>
          <dt className="mb-1 text-muted">Category</dt>
          <dd>
            {canEdit && !linked ? (
              <Select value={txn.account} disabled={busy === "account"} onChange={(e) => patch("account", { account: e.target.value }, "Category updated")}>
                {accounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </Select>
            ) : categoryLabel(txn)}
          </dd>
        </div>
      </dl>
      {txn.notes?.startsWith("Auto-categorised") && (
        <div className="mt-3 flex gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent"><Sparkles className="mt-0.5 size-3.5 shrink-0" />{txn.notes}</div>
      )}
      {txn.receiptPath && <button onClick={viewReceipt} className="mt-4 flex items-center gap-1.5 text-sm text-accent hover:underline"><Paperclip className="size-4" />{txn.receiptName ?? "View receipt"}</button>}
      {!linked && (canEdit || isOwn) && (
        <label className="mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted hover:border-accent hover:text-accent">
          {busy === "receipt" ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
          {txn.receiptPath ? "Replace receipt" : "Attach receipt (photo or PDF, up to 5 MB)"}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </label>
      )}
      {(canEdit || isOwn) && (
        <div className="mt-5">
          <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {notes !== (txn.notes ?? "") && <Button size="sm" className="mt-2" loading={busy === "notes"} onClick={() => patch("notes", { notes }, "Note saved")}>Save note</Button>}
        </div>
      )}
    </Drawer>
  );
}

export default function TransactionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { data, error, loading, setData } = useData<Transaction[]>("/api/transactions");
  const [q, setQ] = useState("");
  const [dir, setDir] = useState("");
  const [src, setSrc] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [newOpen, setNewOpen] = useState(params.get("new") === "1");
  const openId = params.get("open");
  const { toast, toastNode } = useToast();

  const rows = useMemo(() => (data ?? []).filter((t) =>
    (!q || `${t.description} ${t.partyName ?? ""} ${accountName(t.account)}`.toLowerCase().includes(q.toLowerCase())) &&
    (!dir || t.direction === dir) && (!src || t.source === src) && (!onlyMissing || (!t.receipt && t.direction === "out" && !t.linkedType))), [data, q, dir, src, onlyMissing]);
  const open = data?.find((t) => t.id === openId);
  const totals = rows.reduce((a, t) => ({ in: a.in + (t.direction === "in" ? t.amount : 0), out: a.out + (t.direction === "out" ? t.amount : 0) }), { in: 0, out: 0 });

  const upsert = (t: Transaction) => setData((d) => (d ? (d.some((x) => x.id === t.id) ? d.map((x) => (x.id === t.id ? t : x)) : [t, ...d]) : [t]));

  return (
    <div className="px-6 py-5">
      <PageHeader title="Transactions" subtitle="Every rupee in and out of your bank accounts, cards and employee claims. Reconcile them against your bank statement under Banking → Reconcile."
        actions={user && can(user.role, "txn:create") && <Button variant="primary" onClick={() => setNewOpen(true)}><Plus className="size-4" />{user.role === "employee" ? "Submit claim" : "Add transaction"}</Button>} />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Input placeholder="Search description, party or category" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={dir} onChange={(e) => setDir(e.target.value)} className="w-36!"><option value="">In and out</option><option value="in">Money in</option><option value="out">Money out</option></Select>
        <Select value={src} onChange={(e) => setSrc(e.target.value)} className="w-36!"><option value="">All sources</option><option value="bank">Bank</option><option value="card">Card</option><option value="claim">Claims</option></Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Missing receipts only</label>
        <div className="num ml-auto text-sm text-muted">In <span className="text-in">{money(totals.in)}</span> · Out <span className="text-ink">{money(totals.out)}</span></div>
      </Card>
      <ErrorNote message={error} />
      <Card className="overflow-hidden">
        {loading && !data ? <Loading /> : rows.length === 0 ? (data?.length ?? 0) === 0
          ? <Empty icon={Landmark} title="Bring in your bank activity" detail="Import a CSV statement from your bank and match each line, or add an expense by hand." action={{ label: "Import bank statement", href: "/banking/reconcile" }} secondary={{ label: "Add an expense", href: "/transactions?new=1" }} />
          : <Empty title="No transactions match" detail="Try another search or clear the filters." action={{ label: "Clear search", onClick: () => setQ("") }} /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas/60"><tr><Th>Date</Th><Th>Description</Th><Th>Category</Th><Th>Source</Th><Th>Receipt</Th><Th right>Amount</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, 300).map((t) => (
                  <tr key={t.id} onClick={() => router.push(`/transactions?open=${t.id}`, { scroll: false })} className={`cursor-pointer hover:bg-canvas ${t.id === openId ? "bg-accent-soft/50" : ""}`}>
                    <Td className="whitespace-nowrap text-muted">{fmtDate(t.date)}</Td>
                    <Td><div>{t.description}</div>{t.partyName && <div className="text-xs text-muted">{t.partyName}</div>}</Td>
                    <Td className="text-muted">{categoryLabel(t)}{t.status === "pending_review" && <span className="ml-2"><Badge tone="amber">Review</Badge></span>}</Td>
                    <Td className="text-muted">{SOURCE_LABEL[t.source]}</Td>
                    <Td>{t.receipt ? <Badge tone="green">Attached</Badge> : t.direction === "out" ? <Badge tone="amber">Missing</Badge> : <span className="text-muted">—</span>}</Td>
                    <Td right className={t.direction === "in" ? "text-in" : ""}>{t.direction === "in" ? "+" : "−"}{money(t.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <TxnPanel key={open.id + (open.notes ?? "") + open.amount + open.description} txn={open} onClose={() => router.push("/transactions", { scroll: false })} onChange={(t, msg) => { upsert(t); toast(msg ?? "Saved"); }} onDeleted={(id) => { setData((d) => (d ?? []).filter((x) => x.id !== id)); router.push("/transactions", { scroll: false }); toast("Transaction deleted"); }} />}
      {newOpen && <NewTransaction open onClose={() => { setNewOpen(false); router.replace("/transactions"); }} onSaved={(t) => { upsert(t); setNewOpen(false); toast(t.status === "pending_review" ? "Claim submitted for review" : "Transaction booked"); }} />}
      {toastNode}
    </div>
  );
}
