"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileInput } from "lucide-react";
import { useAuth, useData } from "./auth-provider";
import { LineItemsEditor, emptyLine, totalOf } from "./line-items";
import { Button, ErrorNote, FormPage, FormRow, Input, Select } from "./ui";
import { EXPENSE_ACCOUNTS } from "@/lib/accounts";
import { STATES } from "@/lib/gst";
import { addDays, money, today } from "@/lib/format";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vendor = vendors.find((v) => v.id === vendorId);
  const supplier = vendor?.stateCode ?? org?.stateCode ?? "";
  const back = existing ? `/bills?open=${existing.id}&view=all` : "/bills";

  const save = async () => {
    const form = document.getElementById("bill-form") as HTMLFormElement;
    if (!form.reportValidity()) return;
    setBusy(true); setError(null);
    try {
      const body = { vendorId, billNumber, billDate, dueDate, account, items };
      if (existing) await api(`/api/bills/${existing.id}`, { method: "PATCH", json: body });
      else await api("/api/bills", { method: "POST", json: body });
      router.push("/bills?view=pending_approval");
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };

  return (
    <FormPage title={existing ? `Edit Bill ${existing.billNumber}` : "New Bill"} icon={<FileInput className="size-5" />} onClose={() => router.push(back)}
      footer={<>
        <Button variant="primary" loading={busy} onClick={save}>{existing ? "Save and Resubmit for Approval" : "Save and Submit for Approval"}</Button>
        <Button onClick={() => router.push(back)}>Cancel</Button>
        <div className="ml-auto text-sm font-semibold">Total Amount: {totalOf(items, supplier, org?.stateCode ?? "")}</div>
      </>}>
      <form id="bill-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="border-b border-line bg-canvas px-6 py-4">
          <ErrorNote message={error} />
          {existing && <p className="mb-2 text-sm text-warn">Saving changes clears existing approvals and sends the bill for approval again.</p>}
          <FormRow label="Vendor Name" required hint={vendor ? (vendor.gstin ? `GSTIN ${vendor.gstin} · ${STATES[vendor.stateCode]}` : "Unregistered vendor: GST on this bill is not claimable as input credit") : undefined}>
            <Select required value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Select a vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </FormRow>
        </div>
        <div className="px-6 py-4">
          <FormRow label="Bill#" required hint="Duplicate bill numbers from the same vendor are blocked"><Input required value={billNumber} onChange={(e) => setBillNumber(e.target.value)} /></FormRow>
          <FormRow label="Bill Date" required><Input type="date" required value={billDate} onChange={(e) => setBillDate(e.target.value)} /></FormRow>
          <FormRow label="Due Date" required><Input type="date" required value={dueDate} min={billDate} onChange={(e) => setDueDate(e.target.value)} /></FormRow>
          <FormRow label="Expense Account" required>
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>{EXPENSE_ACCOUNTS.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>
          </FormRow>
          <div className="my-4 border-t border-line" />
          <LineItemsEditor items={items} onChange={setItems} supplierState={supplier} placeOfSupply={org?.stateCode ?? ""} />
          <p className="mt-4 text-xs text-muted">Bills of {money(org?.approvalThreshold ?? 0)} or more need a second approval from an admin. The person who records or edits a bill cannot approve it.</p>
        </div>
      </form>
    </FormPage>
  );
}
