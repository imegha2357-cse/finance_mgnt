"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Mail, MessageCircle, Pencil, Printer, Trash2 } from "lucide-react";
import { useAuth, useData } from "@/components/auth-provider";
import { InvoiceStatus } from "@/components/status";
import { Money } from "@/components/finance-ui";
import { Button, ErrorNote, Loading, useToast } from "@/components/ui";
import { STATES } from "@/lib/gst";
import { fmtDate, money, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { invoiceBalance, type CreditNote, type Invoice, type Org, type Party, type PaymentRow } from "@/lib/types";

/** Rupees in words, Indian numbering (lakh/crore), as printed on tax invoices. */
function inWords(n: number) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? " " + a[x % 10] : ""}`);
  const three = (x: number) => `${x >= 100 ? a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " : "") : ""}${x % 100 ? two(x % 100) : ""}`;
  const r = Math.floor(n);
  const p = Math.round((n - r) * 100);
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7), lakh = Math.floor((r % 1e7) / 1e5), thousand = Math.floor((r % 1e5) / 1e3), rest = r % 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return `Rupees ${parts.join(" ") || "Zero"}${p ? ` and ${two(p)} Paise` : ""} Only`;
}

type Detail = { invoice: Invoice; org: Org; customer: Party | null; creditNotes: CreditNote[]; payments: PaymentRow[] };

/** Prefilled WhatsApp / email text (opens the user's own app; no messaging provider needed). */
function shareText(inv: Invoice, org: Org) {
  return `Dear ${inv.customerName},\n\nPlease find invoice ${inv.number} dated ${fmtDate(inv.issueDate)} for ${money(inv.total)}, due on ${fmtDate(inv.dueDate)}.${inv.paymentLink ? `\n\nPay securely by UPI, card or net banking: ${inv.paymentLink}` : ""}\n\nThe PDF copy is attached. Thank you for your business!\n${org.name}${org.gstin ? `\nGSTIN ${org.gstin}` : ""}`;
}
function reminderText(inv: Invoice, org: Org, balance: number) {
  const overdue = inv.dueDate < today();
  return `Dear ${inv.customerName},\n\nThis is a ${overdue ? "reminder that" : "gentle reminder that"} invoice ${inv.number} dated ${fmtDate(inv.issueDate)} has a balance of ${money(balance)}, ${overdue ? "which was" : ""} due on ${fmtDate(inv.dueDate)}.${inv.paymentLink ? `\n\nPay online: ${inv.paymentLink}` : ""}\n\nThank you,\n${org.name}`;
}

export default function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { api, user } = useAuth();
  const router = useRouter();
  const { data, error, loading, reload } = useData<Detail>(`/api/invoices/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { toast, toastNode } = useToast();
  if (loading && !data) return <Loading />;
  if (!data) return <div className="p-6"><ErrorNote message={error} /></div>;
  const { invoice: inv, org, customer, creditNotes, payments } = data;
  const intra = org.stateCode === inv.placeOfSupply;
  const canEdit = !!user && can(user.role, "invoice:create");
  const canUpdate = !!user && can(user.role, "invoice:update");
  const balance = invoiceBalance(inv);

  const act = async (action: "send" | "void", msg: string) => {
    if (action === "void" && !confirm("Void this invoice? The sale will be reversed in the books.")) return;
    setBusy(action); setActionError(null);
    try { await api(`/api/invoices/${id}/action`, { method: "POST", json: { action } }); toast(msg); reload(); }
    catch (e) { setActionError((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!confirm("Delete this draft invoice?")) return;
    setBusy("delete");
    try { await api(`/api/invoices/${id}`, { method: "DELETE" }); router.push("/invoices"); }
    catch (e) { setActionError((e as Error).message); setBusy(null); }
  };
  // A fresh invoice is shared; one that is overdue or part-paid gets a reminder.
  const isReminder = inv.dueDate < today() || inv.amountPaid + inv.amountCredited > 0;
  const text = isReminder ? reminderText(inv, org, balance) : shareText(inv, org);
  const phone = customer?.phone?.replace(/\D/g, "");
  const waHref = `https://wa.me/${phone ? (phone.length === 10 ? "91" + phone : phone) : ""}?text=${encodeURIComponent(text)}`;

  return (
    <div className="px-6 py-5">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/invoices" className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Invoices</Link>
        <div className="flex flex-wrap gap-2">
          {canEdit && inv.status === "draft" && <>
            <Link href={`/invoices/${id}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-canvas"><Pencil className="size-4" />Edit</Link>
            <Button variant="primary" loading={busy === "send"} onClick={() => act("send", "Invoice sent · share it on WhatsApp")}>Send invoice</Button>
            <Button variant="danger" loading={busy === "delete"} onClick={remove}><Trash2 className="size-4" />Delete</Button>
          </>}
          {canUpdate && inv.status === "sent" && <>
            <Link href={`/payments-received/new?invoice=${inv.id}`} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-on-accent hover:bg-accent-hover">Record Payment</Link>
            <Link href={`/credit-notes/new?invoice=${inv.id}`} className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm hover:bg-canvas">Create Credit Note</Link>
          </>}
          {inv.status === "sent" && <>
            <a href={waHref} target="_blank" rel="noreferrer" title={phone ? `Opens WhatsApp with ${customer?.phone}` : "Opens WhatsApp; pick the contact there"} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#25d366]/50 bg-[#25d366]/10 px-3 text-sm font-medium hover:bg-[#25d366]/20"><MessageCircle className="size-4 text-[#1ea952] dark:text-[#25d366]" />{isReminder ? "WhatsApp reminder" : "Share on WhatsApp"}</a>
            <a href={`mailto:${customer?.email ?? ""}?subject=${encodeURIComponent(`${isReminder ? "Payment reminder" : "Invoice"}: ${inv.number}`)}&body=${encodeURIComponent(text)}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-canvas"><Mail className="size-4" />{isReminder ? "Email reminder" : "Email"}</a>
          </>}
          {inv.paymentLink && inv.status === "sent" && <Button onClick={() => { void navigator.clipboard.writeText(inv.paymentLink!); toast("Payment link copied"); }}><Copy className="size-4" />Copy payment link</Button>}
          <Button onClick={() => window.print()}><Printer className="size-4" />Print / PDF</Button>
          {canUpdate && inv.status === "sent" && inv.amountPaid === 0 && inv.amountCredited === 0 && <Button variant="danger" loading={busy === "void"} onClick={() => act("void", "Invoice voided")}>Void</Button>}
        </div>
      </div>
      <ErrorNote message={actionError} />

      {inv.status !== "draft" && (
        <div className="no-print mx-auto mb-4 grid max-w-4xl grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-line px-4 py-3"><div className="text-muted">Invoice total</div><Money value={inv.total} size="lg" /></div>
          <div className="rounded-lg border border-line px-4 py-3"><div className="text-muted">Paid {inv.amountCredited > 0 && "+ credited"}</div><Money value={inv.amountPaid + inv.amountCredited} size="lg" className="text-in" /></div>
          <div className="rounded-lg border border-line px-4 py-3"><div className="text-muted">Balance due</div><Money value={balance} size="lg" className={balance > 0 && inv.dueDate < today() ? "text-out" : ""} /></div>
        </div>
      )}

      <div className="paper mx-auto max-w-4xl rounded-lg border border-line p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-accent">Tax invoice</div>
            <div className="mt-1 text-xl font-semibold">{org.name}</div>
            <div className="max-w-xs text-sm text-muted">{org.address}</div>
            <div className="mt-1 text-sm">GSTIN <span className="font-medium">{org.gstin}</span></div>
          </div>
          <div className="text-right text-sm">
            <div className="text-lg font-semibold">{inv.status === "draft" ? "Draft invoice" : inv.number}</div>
            <div className="mt-1"><InvoiceStatus inv={inv} /></div>
            <div className="mt-2 text-muted">Invoice date {fmtDate(inv.issueDate)}</div>
            <div className="text-muted">Due date {fmtDate(inv.dueDate)}</div>
          </div>
        </div>
        <div className="grid gap-4 border-b border-line py-5 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Bill to</div>
            <div className="mt-1 font-medium">{inv.customerName}</div>
            <div>{inv.customerGstin ? `GSTIN ${inv.customerGstin}` : "Unregistered customer"}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-muted">Place of supply</div>
            <div className="mt-1">{inv.placeOfSupply} · {STATES[inv.placeOfSupply]}</div>
            <div className="text-muted">{intra ? "Intra-state: CGST + SGST" : "Inter-state: IGST"}</div>
          </div>
        </div>
        <table className="num mt-4 w-full text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr><th className="py-2 text-left font-medium">#</th><th className="py-2 text-left font-medium">Item</th><th className="py-2 text-left font-medium">HSN/SAC</th><th className="py-2 text-right font-medium">Qty</th><th className="py-2 text-right font-medium">Rate</th><th className="py-2 text-right font-medium">GST</th><th className="py-2 text-right font-medium">Taxable value</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {inv.items.map((it, i) => (
              <tr key={i}><td className="py-2">{i + 1}</td><td className="py-2">{it.description}</td><td className="py-2 text-muted">{it.hsn || "—"}</td><td className="py-2 text-right">{it.qty}</td><td className="py-2 text-right">{money(it.rate)}</td><td className="py-2 text-right">{it.gstRate}%</td><td className="py-2 text-right">{money(it.qty * it.rate)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap justify-between gap-6 border-t border-line pt-4">
          <div className="max-w-sm text-sm">
            <div className="text-xs uppercase tracking-wide text-muted">Amount in words</div>
            <div className="mt-1">{inWords(inv.total)}</div>
            {inv.notes && <div className="mt-3 text-muted">{inv.notes}</div>}
            {inv.paymentLink && inv.status === "sent" && <div className="mt-3 text-xs">Pay online: <span className="text-accent">{inv.paymentLink}</span></div>}
          </div>
          <dl className="num w-64 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Taxable value</dt><dd>{money(inv.subtotal)}</dd></div>
            {intra ? <>
              <div className="flex justify-between"><dt className="text-muted">CGST</dt><dd>{money(inv.cgst)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">SGST</dt><dd>{money(inv.sgst)}</dd></div>
            </> : <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd>{money(inv.igst)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>Total</dt><dd>{money(inv.total)}</dd></div>
            {inv.amountPaid > 0 && <div className="flex justify-between text-muted"><dt>Payments received</dt><dd>({money(inv.amountPaid)})</dd></div>}
            {inv.amountCredited > 0 && <div className="flex justify-between text-muted"><dt>Credits applied</dt><dd>({money(inv.amountCredited)})</dd></div>}
            {inv.status !== "draft" && <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd>{money(balance)}</dd></div>}
          </dl>
        </div>
        <p className="mt-8 text-xs text-muted">e-Invoice IRN and QR code appear here once a GSP integration is connected. This is a computer-generated invoice.</p>
      </div>

      {(payments.length > 0 || creditNotes.length > 0) && (
        <div className="no-print mx-auto mt-5 grid max-w-4xl gap-4 md:grid-cols-2">
          {payments.length > 0 && (
            <div className="rounded-lg border border-line">
              <div className="border-b border-line bg-canvas px-4 py-2.5 text-sm font-semibold">Payments received</div>
              <ul className="divide-y divide-line text-sm">{payments.map((p) => <li key={p.id} className="flex justify-between px-4 py-2"><span>{fmtDate(p.date)} · {p.mode}{p.reference ? ` · ${p.reference}` : ""}</span><span className="num">{money(p.amount)}</span></li>)}</ul>
            </div>
          )}
          {creditNotes.length > 0 && (
            <div className="rounded-lg border border-line">
              <div className="border-b border-line bg-canvas px-4 py-2.5 text-sm font-semibold">Credit notes</div>
              <ul className="divide-y divide-line text-sm">{creditNotes.map((c) => <li key={c.id} className="flex justify-between px-4 py-2"><span>{c.number} · {fmtDate(c.date)} · {c.reason}</span><span className="num">{money(c.total)}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}
      {toastNode}
    </div>
  );
}
