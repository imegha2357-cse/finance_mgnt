"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HandCoins } from "lucide-react";
import { useAuth, useData } from "./auth-provider";
import { Button, Empty, ErrorNote, FormPage, FormRow, Input, ListHeader, ListTable, Loading, Select, Td, Th } from "./ui";
import { fmtDate, money, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { PAYMENT_MODES, billBalance, invoiceBalance, type Bill, type Invoice, type Party, type PaymentMode, type PaymentRow } from "@/lib/types";
import { NoAccess } from "./ui";

type Kind = "received" | "made";
const META = {
  received: { title: "All Received Payments", party: "Customer Name", ref: "Invoice#", base: "/payments-received", refBase: "/invoices", need: "invoice:update" as const, empty: "No payments received, yet", emptyDetail: "Payments appear here once customers pay their invoices." },
  made: { title: "All Payments Made", party: "Vendor Name", ref: "Bill#", base: "/payments-made", refBase: "/bills?open=", need: "bill:pay" as const, empty: "No vendor payments, yet", emptyDetail: "Approved bills you pay are listed here." },
};

/** Payments Received / Payments Made list. */
export function PaymentsList({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const m = META[kind];
  const { data, error, loading } = useData<PaymentRow[]>(`/api/payments?kind=${kind}`);
  const [view, setView] = useState<string>("all");
  const views = [{ value: "all", label: m.title }, ...PAYMENT_MODES.map((p) => ({ value: p, label: `Mode: ${p}` }))];
  const rows = useMemo(() => (data ?? []).filter((p) => view === "all" || p.mode === view), [data, view]);
  const total = rows.reduce((a, p) => a + p.amount, 0);
  const refHref = (p: PaymentRow) => (kind === "received" ? `/invoices/${p.refId}` : `/bills?open=${p.refId}&view=all`);
  return (
    <div>
      <ListHeader views={views} view={view} onView={setView} newHref={user && can(user.role, m.need) ? `${m.base}/new` : undefined} />
      <div className="flex gap-6 border-b border-line bg-canvas px-6 py-2.5 text-sm">
        <span className="text-muted">Payments: <span className="font-medium text-ink">{rows.length}</span></span>
        <span className="text-muted">Total: <span className="num font-medium text-ink">{money(total)}</span></span>
      </div>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : rows.length === 0 ? <Empty title={m.empty} detail={m.emptyDetail} /> : (
        <ListTable head={<tr><Th>Date</Th><Th>Payment#</Th><Th>Reference#</Th><Th>{m.party}</Th><Th>{m.ref}</Th><Th>Mode</Th><Th right>Amount</Th></tr>}>
          {rows.map((p) => (
            <tr key={p.id}>
              <Td className="whitespace-nowrap">{fmtDate(p.date)}</Td>
              <Td className="text-accent">{p.number}</Td>
              <Td className="text-muted">{p.reference ?? "—"}</Td>
              <Td>{p.partyName}</Td>
              <Td><Link href={refHref(p)} className="text-accent hover:underline">{p.refNumber}</Link></Td>
              <Td className="text-muted">{p.mode}</Td>
              <Td right className="font-medium">{money(p.amount)}</Td>
            </tr>
          ))}
        </ListTable>
      )}
    </div>
  );
}

/** Record a customer payment against an unpaid invoice, or pay an approved vendor bill. */
export function RecordPayment({ kind }: { kind: Kind }) {
  const { api } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const m = META[kind];
  const { data: parties } = useData<Party[]>("/api/parties");
  const { data: docs } = useData<(Invoice | Bill)[]>(kind === "received" ? "/api/invoices" : "/api/bills");
  const preselect = params.get(kind === "received" ? "invoice" : "bill") ?? "";
  const preDoc = (docs ?? []).find((d) => d.id === preselect);
  const [partyId, setPartyId] = useState("");
  const [docId, setDocId] = useState(preselect);
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<PaymentMode>("Bank transfer (NEFT/RTGS/IMPS)");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const partyOf = (d: Invoice | Bill) => ("customerId" in d ? d.customerId : d.vendorId);
  const open = (docs ?? []).filter((d) => (kind === "received" ? d.status === "sent" : d.status === "approved"));
  const effectiveParty = partyId || (preDoc ? partyOf(preDoc) : "");
  const choices = open.filter((d) => !effectiveParty || partyOf(d) === effectiveParty);
  const doc = choices.find((d) => d.id === docId);
  const partyList = (parties ?? []).filter((p) => p.type === (kind === "received" ? "customer" : "vendor") && open.some((d) => partyOf(d) === p.id));
  const docLabel = (d: Invoice | Bill) => ("number" in d ? d.number : (d as Bill).billNumber);
  const balanceOf = (d: Invoice | Bill) => ("number" in d ? invoiceBalance(d as Invoice) : billBalance(d as Bill));
  const due = doc ? balanceOf(doc) : 0;
  const amt = amount === "" ? due : Number(amount);

  const submit = async () => {
    if (!doc) { setError(`Choose ${kind === "received" ? "an invoice" : "a bill"}`); return; }
    if (!(amt > 0) || amt > due + 0.001) { setError(`Enter an amount between ₹0.01 and ${money(due)}`); return; }
    setBusy(true); setError(null);
    try {
      const body = { date, mode, reference: reference || undefined, amount: amt };
      if (kind === "received") await api(`/api/invoices/${doc.id}/payments`, { method: "POST", json: body });
      else await api(`/api/bills/${doc.id}/pay`, { method: "POST", json: body });
      router.push(m.base);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  if (user && !can(user.role, m.need)) return <NoAccess what="recording payments" />;
  return (
    <FormPage title={kind === "received" ? "Record Payment" : "Pay Vendor Bill"} icon={<HandCoins className="size-5" />} onClose={() => router.push(m.base)}
      footer={<><Button variant="primary" loading={busy} onClick={submit}>Save</Button><Button onClick={() => router.push(m.base)}>Cancel</Button>
        {doc && <div className="ml-auto text-sm font-semibold">Amount: {money(amt || 0)}</div>}</>}>
      <div className="border-b border-line bg-canvas px-6 py-4">
        <ErrorNote message={error} />
        <FormRow label={m.party} required>
          <Select value={effectiveParty} onChange={(e) => { setPartyId(e.target.value); setDocId(""); }}>
            <option value="">{partyList.length ? "Select" : kind === "received" ? "No customers with unpaid invoices" : "No vendors with approved bills"}</option>
            {partyList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormRow>
      </div>
      <div className="px-6 py-4">
        <FormRow label={kind === "received" ? "Invoice" : "Bill"} required hint={kind === "made" ? "Only approved bills can be paid" : "Pick the invoice this payment is for"}>
          <Select value={docId} onChange={(e) => { setDocId(e.target.value); setAmount(""); }}>
            <option value="">Select</option>
            {choices.map((d) => <option key={d.id} value={d.id}>{docLabel(d)} · due {fmtDate(d.dueDate)} · balance {money(balanceOf(d))}</option>)}
          </Select>
        </FormRow>
        <FormRow label={kind === "received" ? "Amount Received (₹)" : "Payment Made (₹)"} required hint={doc ? `Balance due ${money(due)} · enter less for a part payment` : undefined}>
          <Input type="number" min="0.01" step="0.01" value={doc ? (amount === "" ? due.toFixed(2) : amount) : ""} disabled={!doc} onChange={(e) => setAmount(e.target.value)} className="num" />
        </FormRow>
        <FormRow label="Payment Date" required><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></FormRow>
        <FormRow label="Payment Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>{PAYMENT_MODES.map((p) => <option key={p}>{p}</option>)}</Select>
        </FormRow>
        <FormRow label="Reference#" hint="UTR, cheque number or UPI reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></FormRow>
        {kind === "made" && <p className="mt-3 max-w-xl text-xs text-muted">This records the payment in the books. Sending the money itself needs a payout integration (for example RazorpayX or your bank&apos;s corporate API).</p>}
      </div>
    </FormPage>
  );
}
