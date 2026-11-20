"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileInput } from "lucide-react";
import { useAuth, useData } from "./auth-provider";
import { LineItemsEditor, emptyLine, totalOf } from "./line-items";
import { Button, ErrorNote, FormPage, FormRow, Input, Select } from "./ui";
import { EXPENSE_ACCOUNTS } from "@/lib/accounts";
import { STATES, computeTax } from "@/lib/gst";
import { TDS_SECTIONS, msmeDeadline, tdsOn } from "@/lib/tds";
import { addDays, fmtDate, money, today } from "@/lib/format";
import type { Bill, LineItem, Party } from "@/lib/types";

/** New / edit bill page body. Editing is allowed while pending approval or after rejection, and restarts approval. */
export function BillForm({ existing }: { existing?: Bill }) {
  const { api, org } = useAuth();
  const router = useRouter();
  const { data: parties } = useData<Party[]>("/api/parties");
  const vendors = (parties ?? []).filter((p) => p.type === "vendor");
  const [vendorId, setVendorId] = useState(existing?.vendorId ?? "");
  const [billNumber, setBillNumber] = useState(existing?.billNumber ?? "");
  const [billDate, setBillDate] = useState(existing?.billDate ?? today());
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(today(), 15));
  const [account, setAccount] = useState(existing?.account ?? "5900");
  const [items, setItems] = useState<LineItem[]>(existing?.items ?? [emptyLine()]);
  const [tdsSection, setTdsSection] = useState(existing?.tdsSection ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vendor = vendors.find((v) => v.id === vendorId);
  const supplier = vendor?.stateCode ?? org?.stateCode ?? "";
  const tax = computeTax(items, supplier, org?.stateCode ?? "");
  const tds = tdsOn(tax.subtotal, tdsSection || undefined);
  const msme = vendor ? msmeDeadline(billDate, dueDate, vendor) : undefined;
  const back = existing ? `/bills?open=${existing.id}&view=all` : "/bills";

  const save = async () => {
    const form = document.getElementById("bill-form") as HTMLFormElement;
    if (!form.reportValidity()) return;
    setBusy(true); setError(null);
    try {
      const body = { vendorId, billNumber, billDate, dueDate, account, items, tdsSection };
      if (existing) await api(`/api/bills/${existing.id}`, { method: "PATCH", json: body });
      else await api("/api/bills", { method: "POST", json: body });
      router.push("/bills?view=pending_approval");
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };

  return (
    <FormPage title={existing ? `Edit bill ${existing.billNumber}` : "New bill"} icon={<FileInput className="size-5" />} onClose={() => router.push(back)}
      footer={<>
        <Button variant="primary" loading={busy} onClick={save}>{existing ? "Save and resubmit for approval" : "Save and submit for approval"}</Button>
        <Button onClick={() => router.push(back)}>Cancel</Button>
        <div className="ml-auto text-right text-sm"><div className="font-semibold">Bill total: {totalOf(items, supplier, org?.stateCode ?? "")}</div>{tds > 0 && <div className="text-xs text-muted">Pay vendor {money(tax.total - tds)} · TDS {money(tds)}</div>}</div>
      </>}>
      <form id="bill-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="border-b border-line bg-canvas px-6 py-4">
          <ErrorNote message={error} />
          {existing && <p className="mb-2 text-sm text-warn">Saving changes clears existing approvals and sends the bill for approval again.</p>}
          <FormRow label="Vendor" required hint={vendor ? (vendor.gstin ? `GSTIN ${vendor.gstin} · ${STATES[vendor.stateCode]}` : "Unregistered vendor: GST on this bill is not claimable as input credit") : undefined}>
            <Select required value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Select a vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </FormRow>
        </div>
        <div className="px-6 py-4">
          <FormRow label="Bill number" required hint="Duplicate bill numbers from the same vendor are blocked"><Input required value={billNumber} onChange={(e) => setBillNumber(e.target.value)} /></FormRow>
          <FormRow label="Bill date" required><Input type="date" required value={billDate} onChange={(e) => setBillDate(e.target.value)} /></FormRow>
          <FormRow label="Due date" required hint={msme ? (dueDate > msme ? undefined : `MSME vendor: pay by ${fmtDate(msme)} to keep this expense deductible (Sec 43B(h))`) : undefined}>
            <Input type="date" required value={dueDate} min={billDate} onChange={(e) => setDueDate(e.target.value)} />
            {msme && dueDate > msme && <p role="alert" className="mt-1 text-xs text-out">This vendor is a {vendor?.msme} enterprise. Under Sec 43B(h) you must pay by {fmtDate(msme)}{vendor?.msmeAgreement ? " (agreed period, max 45 days)" : " (15 days, no written agreement)"}, or the expense is not deductible this year.</p>}
          </FormRow>
          <FormRow label="Expense account" required>
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>{EXPENSE_ACCOUNTS.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>
          </FormRow>
          <FormRow label="TDS to deduct" hint={tds > 0 ? `${money(tds)} on ${money(tax.subtotal)} (value before GST), rounded to the rupee. Deposit by the 7th of next month.` : "Income Tax Act 2025, Section 393 (old 194-series shown in brackets)"}>
            <Select value={tdsSection} onChange={(e) => setTdsSection(e.target.value)}>
              <option value="">No TDS</option>
              {TDS_SECTIONS.map((t) => <option key={t.code} value={t.code}>{t.label} – {t.rate}% (was {t.old})</option>)}
            </Select>
          </FormRow>
          <div className="my-4 border-t border-line" />
          <LineItemsEditor items={items} onChange={setItems} supplierState={supplier} placeOfSupply={org?.stateCode ?? ""} date={billDate} />
          <p className="mt-4 text-xs text-muted">Bills of {money(org?.approvalThreshold ?? 0)} or more need a second approval from an admin. The person who records or edits a bill cannot approve it.</p>
        </div>
      </form>
    </FormPage>
  );
}
