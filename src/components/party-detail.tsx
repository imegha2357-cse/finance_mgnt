"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Printer, Trash2 } from "lucide-react";
import { useAuth, useData } from "./auth-provider";
import { PartyModal } from "./parties-view";
import { BillStatus, InvoiceStatus } from "./status";
import { Badge, Button, ErrorNote, Loading, Tabs, Td, Th, useToast } from "./ui";
import { STATES } from "@/lib/gst";
import { fmtDate, money, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { billBalance, invoiceBalance, type Bill, type CreditNote, type Invoice, type Party } from "@/lib/types";

type Detail = {
  party: Party; invoices: Invoice[]; bills: Bill[]; creditNotes: CreditNote[]; outstanding: number;
  statement: { date: string; type: string; ref: string; href: string; debit: number; credit: number; balance: number }[];
};

/** Customer or vendor page: overview, documents, and a printable statement of account. */
export function PartyDetail({ id, type }: { id: string; type: Party["type"] }) {
  const { api, user, org } = useAuth();
  const router = useRouter();
  const { data, error, loading, reload } = useData<Detail>(`/api/parties/${id}`);
  const [tab, setTab] = useState<"overview" | "statement">("overview");
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { toast, toastNode } = useToast();
  const base = type === "customer" ? "/customers" : "/vendors";
  if (loading && !data) return <Loading />;
  if (!data) return <div className="p-6"><ErrorNote message={error} /></div>;
  const { party: p } = data;
  const writable = !!user && can(user.role, "party:write");

  const remove = async () => {
    if (!confirm(`Delete ${p.name}?`)) return;
    try { await api(`/api/parties/${id}`, { method: "DELETE" }); router.push(base); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3.5">
        <div>
          <Link href={base} className="flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft className="size-3.5" />{type === "customer" ? "Customers" : "Vendors"}</Link>
          <h1 className="mt-0.5 text-xl font-semibold">{p.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {type === "customer" && user && can(user.role, "invoice:create") && <Link href={`/invoices/new?customer=${p.id}`} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-on-accent hover:bg-accent-hover">+ New Invoice</Link>}
          {type === "vendor" && user && can(user.role, "bill:create") && <Link href="/bills/new" className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-on-accent hover:bg-accent-hover">+ New Bill</Link>}
          {writable && <Button onClick={() => setEditing(true)}><Pencil className="size-4" />Edit</Button>}
          {writable && <Button variant="danger" onClick={remove}><Trash2 className="size-4" />Delete</Button>}
        </div>
      </div>
      <div className="px-6 pt-4"><ErrorNote message={err} /></div>
      <div className="no-print px-6"><Tabs value={tab} onChange={setTab} tabs={[{ value: "overview", label: "Overview" }, { value: "statement", label: "Statement" }]} /></div>

      {tab === "overview" && (
        <div className="grid gap-5 px-6 pb-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-line p-4">
              <div className="text-sm text-muted">{type === "customer" ? "Outstanding receivables" : "Outstanding payables"}</div>
              <div className="num mt-1 text-2xl font-semibold">{money(data.outstanding)}</div>
            </div>
            <dl className="space-y-2 rounded-lg border border-line p-4 text-sm">
              <div><dt className="text-muted">GST treatment</dt><dd>{p.gstin ? <>Registered · <span className="font-mono text-xs">{p.gstin}</span></> : <Badge>Unregistered</Badge>}</dd></div>
              <div><dt className="text-muted">Place of supply</dt><dd>{STATES[p.stateCode]}</dd></div>
              {p.pan && <div><dt className="text-muted">PAN</dt><dd className="font-mono text-xs">{p.pan}</dd></div>}
              <div><dt className="text-muted">Email</dt><dd>{p.email ?? "—"}</dd></div>
              <div><dt className="text-muted">Phone</dt><dd>{p.phone ?? "—"}</dd></div>
            </dl>
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="border-b border-line bg-canvas px-4 py-2.5 text-sm font-semibold">{type === "customer" ? "Invoices" : "Bills"}</div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line"><tr><Th>Date</Th><Th>Number</Th><Th>Status</Th><Th right>Amount</Th><Th right>Balance</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {type === "customer" ? data.invoices.map((i) => (
                    <tr key={i.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/invoices/${i.id}`)}>
                      <Td>{fmtDate(i.issueDate)}</Td><Td className="text-accent">{i.status === "draft" ? "Draft" : i.number}</Td><Td><InvoiceStatus inv={i} /></Td><Td right>{money(i.total)}</Td><Td right>{money(i.status === "draft" ? i.total : invoiceBalance(i))}</Td>
                    </tr>
                  )) : data.bills.map((b) => (
                    <tr key={b.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/bills?open=${b.id}&view=all`)}>
                      <Td>{fmtDate(b.billDate)}</Td><Td className="text-accent">{b.billNumber}</Td><Td><BillStatus bill={b} /></Td><Td right>{money(b.total)}</Td><Td right>{money(billBalance(b))}</Td>
                    </tr>
                  ))}
                  {(type === "customer" ? data.invoices : data.bills).length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">Nothing yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "statement" && (
        <div className="px-6 pb-6">
          <div className="no-print mb-3 flex justify-end"><Button onClick={() => window.print()}><Printer className="size-4" />Print / PDF</Button></div>
          <div className="mx-auto max-w-4xl rounded-lg border border-line p-6 print:border-0">
            <div className="flex justify-between border-b border-line pb-4">
              <div><div className="text-xs font-semibold uppercase tracking-widest text-accent">Statement of account</div><div className="mt-1 font-semibold">{org?.name}</div><div className="text-sm text-muted">GSTIN {org?.gstin}</div></div>
              <div className="text-right text-sm"><div className="font-semibold">{p.name}</div>{p.gstin && <div className="text-muted">GSTIN {p.gstin}</div>}<div className="text-muted">As of {fmtDate(today())}</div></div>
            </div>
            <table className="num mt-4 w-full text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-2 text-left font-medium">Date</th><th className="py-2 text-left font-medium">Transaction</th><th className="py-2 text-left font-medium">Details</th><th className="py-2 text-right font-medium">{type === "customer" ? "Amount" : "Payments"}</th><th className="py-2 text-right font-medium">{type === "customer" ? "Payments / credits" : "Bills"}</th><th className="py-2 text-right font-medium">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.statement.map((l, k) => (
                  <tr key={k}><td className="py-2">{fmtDate(l.date)}</td><td className="py-2">{l.type}</td><td className="py-2"><Link href={l.href} className="text-accent">{l.ref}</Link></td><td className="py-2 text-right">{l.debit ? money(l.debit) : ""}</td><td className="py-2 text-right">{l.credit ? money(l.credit) : ""}</td><td className="py-2 text-right">{money(l.balance)}</td></tr>
                ))}
                {!data.statement.length && <tr><td colSpan={6} className="py-8 text-center text-muted">No transactions</td></tr>}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end border-t border-line pt-3 text-sm font-semibold">Balance due: <span className="num ml-2">{money(data.statement.at(-1)?.balance ?? 0)}</span></div>
          </div>
        </div>
      )}
      {editing && <PartyModal type={type} existing={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); toast("Saved"); reload(); }} />}
      {toastNode}
    </div>
  );
}
