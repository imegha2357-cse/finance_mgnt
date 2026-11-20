"use client";
import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import { useAuth, useData } from "@/components/auth-provider";
import { BillStatus as BillStatusText } from "@/components/status";
import { Badge, Button, Drawer, Empty, ErrorNote, Field, ListHeader, ListTable, Loading, Td, Textarea, Th, useToast } from "@/components/ui";
import { accountName } from "@/lib/accounts";
import { fmtDate, money, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { billBalance, type Bill, type BillStatus } from "@/lib/types";
import { tdsLabel } from "@/lib/tds";

type BillRow = Bill & { approvalBlocker: string | null };
const STATUS: Record<BillStatus, { label: string; tone: "amber" | "blue" | "green" | "red" }> = {
  pending_approval: { label: "Pending approval", tone: "amber" },
  approved: { label: "Approved · unpaid", tone: "blue" },
  paid: { label: "Paid", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

function BillPanel({ bill, onClose, onChanged }: { bill: BillRow; onClose: () => void; onChanged: (msg: string) => void }) {
  const { api, user } = useAuth();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (key: string, path: string, body: unknown, msg: string) => {
    setBusy(key); setError(null);
    try { await api(path, { method: "POST", json: body }); onChanged(msg); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const canDecide = !bill.approvalBlocker;
  const canPay = bill.status === "approved" && !!user && can(user.role, "bill:pay");
  const canChange = (bill.status === "pending_approval" || bill.status === "rejected") && !!user && can(user.role, "bill:create");
  const router = useRouter();
  const remove = async () => {
    if (!confirm(`Delete bill ${bill.billNumber}?`)) return;
    setBusy("delete"); setError(null);
    try { await api(`/api/bills/${bill.id}`, { method: "DELETE" }); onChanged("Bill deleted"); router.push("/bills"); }
    catch (e) { setError((e as Error).message); setBusy(null); }
  };
  const s = STATUS[bill.status];

  return (
    <Drawer open onClose={onClose}
      title={<div><div className="truncate">{bill.vendorName}</div><div className="text-xs font-normal text-muted">Bill {bill.billNumber} · due {fmtDate(bill.dueDate)}</div></div>}
      footer={<>
        {canChange && <Button variant="danger" loading={busy === "delete"} onClick={remove}>Delete</Button>}
        {canChange && <a href={`/bills/${bill.id}/edit`} className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm hover:bg-canvas">{bill.status === "rejected" ? "Edit and resubmit" : "Edit"}</a>}
        {canDecide && <Button variant="danger" loading={busy === "reject"} onClick={() => act("reject", `/api/bills/${bill.id}/approve`, { decision: "rejected", comment }, "Bill rejected")}><X className="size-4" />Reject</Button>}
        {canDecide && <Button variant="primary" loading={busy === "approve"} onClick={() => act("approve", `/api/bills/${bill.id}/approve`, { decision: "approved", comment }, "Bill approved")}><Check className="size-4" />Approve</Button>}
        {canPay && <a href={`/payments-made/new?bill=${bill.id}`} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-on-accent hover:bg-accent-hover">Record payment · {money(billBalance(bill))}</a>}
      </>}>
      <ErrorNote message={error} />
      <div className="num text-3xl font-semibold">{money(bill.total)}</div>
      <div className="mt-2"><Badge tone={s.tone}>{s.label}</Badge></div>
      <dl className="num mt-5 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted">Category</dt><dd>{accountName(bill.account)}</dd>
        <dt className="text-muted">Bill date</dt><dd>{fmtDate(bill.billDate)}</dd>
        <dt className="text-muted">Taxable value</dt><dd>{money(bill.subtotal)}</dd>
        {bill.igst ? <><dt className="text-muted">IGST</dt><dd>{money(bill.igst)}</dd></> : <><dt className="text-muted">CGST + SGST</dt><dd>{money(bill.cgst + bill.sgst)}</dd></>}
        {bill.amountPaid > 0 && <><dt className="text-muted">Paid so far</dt><dd>{money(bill.amountPaid)}</dd></>}
        {bill.tdsAmount ? <><dt className="text-muted">TDS deducted</dt><dd>{money(bill.tdsAmount)} <span className="text-xs text-muted">({tdsLabel(bill.tdsSection)})</span></dd></> : null}
        {bill.msmeDeadline && bill.status !== "paid" ? <><dt className="text-muted">MSME pay-by</dt><dd className={bill.msmeDeadline < today() ? "font-medium text-out" : "font-medium"}>{fmtDate(bill.msmeDeadline)} <span className="text-xs font-normal text-muted">Sec 43B(h)</span></dd></> : null}
        <dt className="text-muted">Balance due</dt><dd className="font-medium">{money(billBalance(bill))}</dd>
        {!bill.vendorGstin && <><dt className="text-muted">Input GST</dt><dd className="text-warn">Not claimable (unregistered vendor)</dd></>}
        {bill.paidAt && <><dt className="text-muted">Paid on</dt><dd>{fmtDate(bill.paidAt)}</dd></>}
      </dl>
      <h3 className="mt-6 text-sm font-semibold">Items</h3>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
        {bill.items.map((it, i) => <li key={i} className="flex justify-between px-3 py-2"><span>{it.description} <span className="text-muted">× {it.qty} · {it.gstRate}% GST</span></span><span className="num">{money(it.qty * it.rate)}</span></li>)}
      </ul>
      <h3 className="mt-6 text-sm font-semibold">Approvals <span className="font-normal text-muted">({bill.approvals.filter((a) => a.decision === "approved").length} of {bill.approvalsRequired})</span></h3>
      <ol className="mt-2 space-y-2 text-sm">
        {bill.approvals.map((a, i) => (
          <li key={i} className="flex gap-2">
            {a.decision === "approved" ? <Check className="mt-0.5 size-4 text-in" /> : <X className="mt-0.5 size-4 text-out" />}
            <div><div>{a.byName} <span className="text-muted">({a.role}) {a.decision} · {fmtDate(a.at)}</span></div>{a.comment && <div className="text-muted">“{a.comment}”</div>}</div>
          </li>
        ))}
        {bill.status === "pending_approval" && <li className="text-muted">Waiting for {bill.approvalsRequired > 1 && bill.approvals.length === 1 ? "an admin's final approval" : "an approver"}</li>}
      </ol>
      {canDecide && <Field label="Comment (optional)" className="mt-5"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>}
      {!canDecide && bill.status === "pending_approval" && <p className="mt-5 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">{bill.approvalBlocker}</p>}
    </Drawer>
  );
}

type View = BillStatus | "all";
const VIEWS: { value: View; label: string }[] = [
  { value: "all", label: "All bills" }, { value: "pending_approval", label: "Pending Approval" }, { value: "approved", label: "Open (to pay)" },
  { value: "paid", label: "Paid" }, { value: "rejected", label: "Rejected" },
];

export default function BillsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { data, error, loading, reload } = useData<BillRow[]>("/api/bills");
  const [view, setView] = useState<View>((params.get("view") as View) ?? "all");
  const { toast, toastNode } = useToast();
  const openId = params.get("open");
  const rows = useMemo(() => (data ?? []).filter((b) => view === "all" || b.status === view), [data, view]);
  const open = data?.find((b) => b.id === openId);
  const yourTurn = (data ?? []).filter((b) => !b.approvalBlocker).length;
  const openTotal = rows.filter((b) => b.status === "approved").reduce((a, b) => a + billBalance(b), 0);

  return (
    <div>
      <ListHeader views={VIEWS} view={view} onView={setView} newHref={user && can(user.role, "bill:create") ? "/bills/new" : undefined} />
      <div className="flex flex-wrap gap-6 border-b border-line bg-canvas px-6 py-2.5 text-sm">
        <span className="text-muted">Bills: <span className="font-medium text-ink">{rows.length}</span></span>
        <span className="text-muted">Unpaid: <span className="num font-medium text-ink">{money(openTotal)}</span></span>
        {yourTurn > 0 && <button onClick={() => setView("pending_approval")} className="font-medium text-accent">{yourTurn} waiting for your approval</button>}
      </div>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : rows.length === 0 ? (data?.length ?? 0) === 0
        ? <Empty icon={Receipt} title="Record your first vendor bill" detail="Bills go through approval before they can be paid, and GST from registered vendors becomes input tax credit." action={user && can(user.role, "bill:create") ? { label: "New bill", href: "/bills/new" } : undefined} />
        : <Empty title={view === "pending_approval" ? "Nothing waiting for approval" : "No bills in this view"} detail="Nothing matches this filter right now." action={{ label: "Show all bills", onClick: () => setView("all") }} /> : (
        <ListTable head={<tr><Th className="hidden md:table-cell">Date</Th><Th className="hidden md:table-cell">Bill no.</Th><Th>Vendor</Th><Th className="hidden xl:table-cell">Account</Th><Th>Status</Th><Th className="hidden md:table-cell">Due date</Th><Th right className="hidden md:table-cell">Amount</Th><Th right>Balance due</Th></tr>}>
          {rows.map((b) => (
            <tr key={b.id} onClick={() => router.push(`/bills?open=${b.id}&view=${view}`, { scroll: false })} className="cursor-pointer">
              <Td className="hidden whitespace-nowrap md:table-cell">{fmtDate(b.billDate)}</Td>
              <Td className="hidden text-accent md:table-cell">{b.billNumber}</Td>
              <Td>{b.vendorName}{b.msmeDeadline && b.status !== "paid" && <span className="ml-1.5" title={`MSME vendor: pay by ${fmtDate(b.msmeDeadline)} (Sec 43B(h))`}><Badge tone={b.msmeDeadline < today() ? "red" : "amber"}>MSME</Badge></span>}<div className="text-xs text-muted md:hidden">{b.billNumber} · due {fmtDate(b.dueDate)}</div></Td>
              <Td className="hidden text-muted xl:table-cell">{accountName(b.account)}</Td>
              <Td><BillStatusText bill={b} />{!b.approvalBlocker && <span className="ml-1.5"><Badge tone="teal">Your turn</Badge></span>}</Td>
              <Td className="hidden whitespace-nowrap md:table-cell">{fmtDate(b.dueDate)}</Td>
              <Td right className="hidden md:table-cell">{money(b.total)}</Td>
              <Td right>{money(billBalance(b))}</Td>
            </tr>
          ))}
        </ListTable>
      )}
      {open && <BillPanel bill={open} onClose={() => router.push(`/bills?view=${view}`, { scroll: false })} onChanged={(m) => { toast(m); reload(); }} />}
      {toastNode}
    </div>
  );
}
