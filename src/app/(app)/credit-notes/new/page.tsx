"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { useAuth, useData } from "@/components/auth-provider";
import { Guard } from "@/components/guard";
import { LineItemsEditor, emptyLine } from "@/components/line-items";
import { Button, ErrorNote, FormPage, FormRow, Input, Select } from "@/components/ui";
import { computeTax } from "@/lib/gst";
import { money, today } from "@/lib/format";
import { invoiceBalance, type Invoice, type LineItem } from "@/lib/types";

export default function NewCreditNotePage() {
  const { api, org } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { data: invoices } = useData<Invoice[]>("/api/invoices");
  const open = (invoices ?? []).filter((i) => i.status === "sent");
  const [invoiceId, setInvoiceId] = useState(params.get("invoice") ?? "");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<LineItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inv = open.find((i) => i.id === invoiceId);
  const lines = items ?? (inv ? inv.items.map((it) => ({ ...it })) : [emptyLine()]);
  const total = inv ? computeTax(lines, org?.stateCode ?? "", inv.placeOfSupply).total : 0;
  const balance = inv ? invoiceBalance(inv) : 0;

  const save = async () => {
    const form = document.getElementById("cn-form") as HTMLFormElement;
    if (!form.reportValidity()) return;
    setBusy(true); setError(null);
    try {
      await api("/api/credit-notes", { method: "POST", json: { invoiceId, date, reason, items: lines } });
      router.push(`/invoices/${invoiceId}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <Guard need="invoice:update" what="credit notes">
      <FormPage title="New Credit Note" icon={<ReceiptText className="size-5" />} onClose={() => router.push("/credit-notes")}
        footer={<><Button variant="primary" loading={busy} onClick={save} disabled={!inv}>Save Credit Note</Button><Button onClick={() => router.back()}>Cancel</Button>
          {inv && <div className={`ml-auto text-sm font-semibold ${total > balance + 0.001 ? "text-out" : ""}`}>Credit: {money(total)} of {money(balance)} due</div>}</>}>
        <form id="cn-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="border-b border-line bg-canvas px-6 py-4">
            <ErrorNote message={error} />
            <FormRow label="Invoice" required hint={inv ? `${inv.customerName} · balance due ${money(balance)}` : open.length ? undefined : "No sent invoices with a balance"}>
              <Select required value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); setItems(null); }}>
                <option value="">Select an unpaid invoice</option>
                {open.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.customerName} · {money(invoiceBalance(i))}</option>)}
              </Select>
            </FormRow>
          </div>
          <div className="px-6 py-4">
            <FormRow label="Credit Note Date" required><Input type="date" required value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></FormRow>
            <FormRow label="Reason" required hint="e.g. goods returned, post-sale discount, billing error"><Input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></FormRow>
            <div className="my-4 border-t border-line" />
            {inv ? (
              <>
                <p className="mb-2 text-sm text-muted">Starts with the invoice&apos;s items. Reduce quantities or rates to what you are crediting, and remove rows you are not.</p>
                <LineItemsEditor showHsn items={lines} onChange={setItems} supplierState={org?.stateCode ?? ""} placeOfSupply={inv.placeOfSupply} />
              </>
            ) : <p className="text-sm text-muted">Choose an invoice first.</p>}
          </div>
        </form>
      </FormPage>
    </Guard>
  );
}
