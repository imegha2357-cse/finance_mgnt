"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { useAuth, useData } from "./auth-provider";
import { LineItemsEditor, emptyLine, totalOf } from "./line-items";
import { Button, ErrorNote, FormPage, FormRow, Input, Select, Textarea } from "./ui";
import { STATES } from "@/lib/gst";
import { addDays, daysBetween, fiscalYear, today } from "@/lib/format";
import type { Invoice, Item, LineItem, Org, Party } from "@/lib/types";

const TERMS = [{ label: "Due on Receipt", days: 0 }, { label: "Net 15", days: 15 }, { label: "Net 30", days: 30 }, { label: "Net 45", days: 45 }, { label: "Net 60", days: 60 }];

/** The number the next sent invoice will get (numbers are assigned on send, so drafts never leave gaps). */
export function previewInvoiceNumber(org: Org | null, date: string) {
  if (!org) return "";
  const fy = fiscalYear(date).label;
  const perYear = org.invoicePrefix.includes("{FY}");
  const key = perYear ? `invoice-${fy}` : "invoice";
  return `${org.invoicePrefix.replaceAll("{FY}", fy)}${String((org.sequences?.[key] ?? 0) + 1).padStart(4, "0")}`;
}

/** New / edit invoice page body. `existing` must be a draft. */
export function InvoiceForm({ existing, presetCustomer }: { existing?: Invoice; presetCustomer?: string }) {
  const { api, org } = useAuth();
  const router = useRouter();
  const { data: parties } = useData<Party[]>("/api/parties");
  const { data: catalog } = useData<Item[]>("/api/items");
  const customers = (parties ?? []).filter((p) => p.type === "customer");
  const [customerId, setCustomerId] = useState(existing?.customerId ?? presetCustomer ?? "");
  const [issueDate, setIssueDate] = useState(existing?.issueDate ?? today());
  const initialTerms = existing ? daysBetween(existing.issueDate, existing.dueDate) : 30;
  const [terms, setTerms] = useState(TERMS.some((t) => t.days === initialTerms) ? initialTerms : -1);
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(today(), 30));
  const [pos, setPos] = useState(existing?.placeOfSupply ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "Thanks for your business.");
  const [items, setItems] = useState<LineItem[]>(existing?.items ?? [emptyLine()]);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const customer = customers.find((c) => c.id === customerId);
  const placeOfSupply = pos || customer?.stateCode || org?.stateCode || "";
  const back = existing ? `/invoices/${existing.id}` : "/invoices";

  const save = async (send: boolean) => {
    const form = document.getElementById("inv-form") as HTMLFormElement;
    if (!form.reportValidity()) return;
    setBusy(send ? "send" : "draft"); setError(null);
    try {
      const body = { customerId, issueDate, dueDate, placeOfSupply, items, notes, send };
      const inv = existing
        ? await api<Invoice>(`/api/invoices/${existing.id}`, { method: "PATCH", json: body })
        : await api<Invoice>("/api/invoices", { method: "POST", json: body });
      router.push(`/invoices/${inv.id}`);
    } catch (err) { setError((err as Error).message); setBusy(null); }
  };

  return (
    <FormPage title={existing ? "Edit Invoice" : "New Invoice"} icon={<FileText className="size-5" />} onClose={() => router.push(back)}
      footer={<>
        <Button loading={busy === "draft"} onClick={() => save(false)}>Save as Draft</Button>
        <Button variant="primary" loading={busy === "send"} onClick={() => save(true)}>Save and Send</Button>
        <Button onClick={() => router.push(back)}>Cancel</Button>
        <div className="ml-auto text-right text-sm"><span className="font-semibold">Total Amount: {totalOf(items, org?.stateCode ?? "", placeOfSupply)}</span><div className="text-xs text-muted">Total Quantity: {items.reduce((a, i) => a + (i.qty || 0), 0)}</div></div>
      </>}>
      <form id="inv-form" onSubmit={(e) => { e.preventDefault(); void save(true); }}>
        <div className="border-b border-line bg-canvas px-6 py-4">
          <ErrorNote message={error} />
          <FormRow label="Customer Name" required hint={customer ? (customer.gstin ? `GSTIN ${customer.gstin} · ${STATES[customer.stateCode]}` : "Unregistered customer (B2C)") : customers.length ? undefined : "Add customers under Sales → Customers"}>
            <Select required value={customerId} onChange={(e) => { setCustomerId(e.target.value); setPos(""); }}>
              <option value="">Select a customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormRow>
        </div>
        <div className="px-6 py-4">
          <FormRow label="Invoice#" hint="Assigned when the invoice is sent, so drafts never leave gaps in your GST series">
            <Input value={existing && existing.status !== "draft" ? existing.number : `${previewInvoiceNumber(org, issueDate)} (on send)`} disabled />
          </FormRow>
          <div className="grid gap-x-8 xl:grid-cols-[600px_1fr]">
            <FormRow label="Invoice Date" required><Input type="date" required value={issueDate} onChange={(e) => { setIssueDate(e.target.value); if (terms >= 0) setDueDate(addDays(e.target.value, terms)); }} /></FormRow>
            <div className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span>Terms</span>
              <Select value={terms} onChange={(e) => { const d = Number(e.target.value); setTerms(d); if (d >= 0) setDueDate(addDays(issueDate, d)); }} className="w-40!">
                {TERMS.map((t) => <option key={t.days} value={t.days}>{t.label}</option>)}
                <option value={-1}>Custom</option>
              </Select>
              <span>Due Date</span>
              <Input type="date" required value={dueDate} min={issueDate} onChange={(e) => { setDueDate(e.target.value); setTerms(-1); }} className="w-44!" />
            </div>
          </div>
          <FormRow label="Place of Supply" required hint="Decides CGST + SGST (same state) or IGST (other state)">
            <Select value={placeOfSupply} onChange={(e) => setPos(e.target.value)}>
              {Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>[{code}] {name}</option>)}
            </Select>
          </FormRow>
          <div className="my-4 border-t border-line" />
          <LineItemsEditor showHsn catalog={catalog ?? []} items={items} onChange={setItems} supplierState={org?.stateCode ?? ""} placeOfSupply={placeOfSupply} />
          <div className="mt-5 max-w-lg">
            <label className="mb-1 block text-sm">Customer Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            <span className="mt-1 block text-xs text-muted">Will be displayed on the invoice</span>
          </div>
        </div>
      </form>
    </FormPage>
  );
}
