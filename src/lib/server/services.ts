import "server-only";
import { getStore, newId, type Op } from "./store";
import { HttpError } from "./http";
import { createPaymentLink, paymentLinksEnabled } from "./razorpay";
import {
  ACCOUNTS, AP, AR, BANK, EQUITY, INPUT_GST, OUTPUT_GST, REIMB, ROUND_OFF, SALES, TDS_PAYABLE, accountName, accountType, suggestAccount,
} from "../accounts";
import { computeTax, rateProblem, round2, stateFromGstin, upcomingComplianceDates } from "../gst";
import { msmeDeadline, tdsOn, tdsSection } from "../tds";
import { addDays, addMonths, fiscalYear, fmtDate, today as todayIst } from "../format";
import { can } from "../permissions";
import {
  billBalance, invoiceBalance,
  type AgeSplit, type AuditEvent, type BankLine, type Bill, type CreditNote, type DashboardData, type InboxItem, type Invoice,
  type Item, type JournalEntry, type JournalLine, type LineItem, type Org, type Party, type PaymentMode, type PaymentRow,
  type RecurringProfile, type SearchHit, type SessionUser, type Transaction, type TxnDirection, type TxnSource,
} from "../types";

const nowIso = () => new Date().toISOString();
const db = () => getStore();
const SYSTEM = (orgId: string): SessionUser => ({ uid: "system", name: "System", email: "", role: "admin", orgId });

/** After returns are filed the books are locked; nothing dated on or before the lock date may change. */
async function assertOpen(orgId: string, ...dates: (string | undefined)[]) {
  const lock = (await getOrg(orgId)).lockedUntil;
  if (!lock) return;
  const hit = dates.find((d) => d && d <= lock);
  if (hit) throw new HttpError(423, `Books are locked up to ${fmtDate(lock)} because returns for that period are filed. An admin can change the lock date in Settings.`, "locked");
}

/** GST 2.0: 12% and 28% are not valid on documents dated from 22 Sep 2025; 40% is not valid before. */
function checkRates(items: LineItem[], date: string) {
  for (const it of items) {
    const p = rateProblem(it.gstRate, date);
    if (p) throw new HttpError(400, `${it.description}: ${p}`, "gst_rate");
  }
}

// ───────────────────────── org, numbering & audit ─────────────────────────

export async function getOrg(orgId: string): Promise<Org> {
  const org = await db().getOrg(orgId);
  if (!org) throw new HttpError(404, "Organisation not found");
  return org;
}

export async function audit(s: SessionUser, action: string, target: string, detail?: string) {
  if (s.uid === "system" && action !== "recurring.invoice_created" && action !== "invoice.paid_online") return;
  const ev: AuditEvent = { id: newId(), at: nowIso(), actor: s.uid, actorName: s.name, action, target, detail };
  await db().put(s.orgId, "audit", ev);
}

/** Sequence key + display prefix for a document dated `date`. `{FY}` in the prefix restarts numbering every 1 April. */
export function numbering(prefix: string, kind: "invoice" | "credit_note", date: string) {
  const fy = fiscalYear(date).label;
  const perYear = prefix.includes("{FY}");
  return { key: perYear ? `${kind}-${fy}` : kind, prefix: prefix.replaceAll("{FY}", fy) };
}

async function nextNumber(org: Org, kind: "invoice" | "credit_note", date: string) {
  const base = kind === "invoice" ? org.invoicePrefix : "CN/{FY}/";
  const { key, prefix } = numbering(base, kind, date);
  const n = await db().nextSequence(org.id, key); // atomic: two users can never get the same number
  return `${prefix}${String(n).padStart(4, "0")}`;
}

// ───────────────────────── ledger ─────────────────────────

function entry(id: string, date: string, memo: string, refType: JournalEntry["refType"], refId: string, lines: JournalLine[]): JournalEntry {
  const d = round2(lines.reduce((a, l) => a + l.debit, 0));
  const c = round2(lines.reduce((a, l) => a + l.credit, 0));
  if (Math.abs(d - c) > 0.01) throw new Error(`Unbalanced journal ${id}: ${d} vs ${c}`);
  return { id, date, memo, refType, refId, lines: lines.filter((l) => l.debit || l.credit), createdAt: nowIso() };
}
const dr = (account: string, amount: number): JournalLine => ({ account, debit: round2(amount), credit: 0 });
const cr = (account: string, amount: number): JournalLine => ({ account, debit: 0, credit: round2(amount) });
const taxOf = (d: { cgst: number; sgst: number; igst: number }) => round2(d.cgst + d.sgst + d.igst);
const del = (col: Op["col"], id: string): Op => ({ col, doc: { id }, delete: true });

export function openingEntry(date: string, amount: number) {
  return entry("opening", date, "Opening bank balance", "opening", "opening", [dr(BANK, amount), cr(EQUITY, amount)]);
}

/** Bank/card spend leaves the bank now; an employee claim is owed to the employee until reimbursed. */
function txnEntry(t: Transaction): JournalEntry {
  const cashSide = t.source === "claim" && t.direction === "out" ? REIMB : BANK;
  const lines = t.direction === "out" ? [dr(t.account, t.amount), cr(cashSide, t.amount)] : [dr(BANK, t.amount), cr(t.account, t.amount)];
  return entry(`txn-${t.id}`, t.date, t.description, "transaction", t.id, lines);
}

/** Input GST is claimable only from registered vendors; otherwise the tax is part of the cost. */
function billEntry(b: Bill) {
  const tds = b.tdsAmount ?? 0;
  // TDS withheld is owed to the government, not the vendor.
  const credits = tds > 0 ? [cr(AP, b.total - tds), cr(TDS_PAYABLE, tds)] : [cr(AP, b.total)];
  const lines = b.vendorGstin
    ? [dr(b.account, b.subtotal), dr(INPUT_GST, taxOf(b)), ...credits]
    : [dr(b.account, b.total), ...credits];
  return entry(`bill-${b.id}`, b.billDate, `Bill ${b.billNumber} from ${b.vendorName}`, "bill", b.id, lines);
}
function invoiceEntry(inv: Invoice) {
  return entry(`inv-${inv.id}`, inv.issueDate, `Invoice ${inv.number} to ${inv.customerName}`, "invoice", inv.id,
    [dr(AR, inv.total), cr(SALES, inv.subtotal), cr(OUTPUT_GST, taxOf(inv)), ...roundOffLine(inv.roundOff)]);
}
const roundOffLine = (r?: number) => (!r ? [] : r > 0 ? [cr(ROUND_OFF, r)] : [dr(ROUND_OFF, -r)]);
function creditNoteEntry(cn: CreditNote) {
  return entry(`cn-${cn.id}`, cn.date, `Credit note ${cn.number} on ${cn.invoiceNumber}`, "credit_note", cn.id,
    [dr(SALES, cn.subtotal), dr(OUTPUT_GST, taxOf(cn)), cr(AR, cn.total)]);
}

// ───────────────────────── parties ─────────────────────────

export interface PartyInput { type: "vendor" | "customer"; name: string; gstin?: string; stateCode?: string; email?: string; phone?: string; pan?: string; msme?: "" | Party["msme"]; udyam?: string; msmeAgreement?: boolean }

async function partyFields(s: SessionUser, input: Omit<PartyInput, "type">) {
  const gstin = input.gstin?.trim().toUpperCase() || undefined;
  return {
    name: input.name.trim(), gstin,
    stateCode: gstin ? stateFromGstin(gstin) : input.stateCode || (await getOrg(s.orgId)).stateCode,
    email: input.email || undefined, phone: input.phone || undefined, pan: input.pan?.toUpperCase() || undefined,
    msme: input.msme || undefined, udyam: input.msme ? input.udyam?.toUpperCase() || undefined : undefined,
    msmeAgreement: input.msme ? Boolean(input.msmeAgreement) : undefined,
  };
}

export async function createParty(s: SessionUser, input: PartyInput) {
  const dupe = (await listParties(s.orgId)).find((p) => p.type === input.type && p.name.toLowerCase() === input.name.trim().toLowerCase());
  if (dupe) throw new HttpError(409, `A ${input.type} named "${dupe.name}" already exists`);
  const p: Party = { id: newId(), type: input.type, ...(await partyFields(s, input)), createdAt: nowIso() };
  await db().put(s.orgId, "parties", p);
  await audit(s, "party.created", p.name, p.type);
  return p;
}

export async function updateParty(s: SessionUser, id: string, input: Omit<PartyInput, "type">) {
  const p = await db().get<Party>(s.orgId, "parties", id);
  if (!p) throw new HttpError(404, "Not found");
  const next: Party = { ...p, ...(await partyFields(s, input)) };
  await db().put(s.orgId, "parties", next);
  await audit(s, "party.updated", next.name);
  return next;
}

export async function deleteParty(s: SessionUser, id: string) {
  const p = await db().get<Party>(s.orgId, "parties", id);
  if (!p) throw new HttpError(404, "Not found");
  const used = p.type === "customer"
    ? (await db().list<Invoice>(s.orgId, "invoices")).some((i) => i.customerId === id) || (await db().list<RecurringProfile>(s.orgId, "recurring")).some((r) => r.customerId === id)
    : (await db().list<Bill>(s.orgId, "bills")).some((b) => b.vendorId === id);
  if (used) throw new HttpError(409, `${p.name} has ${p.type === "customer" ? "invoices" : "bills"} and cannot be deleted`);
  await db().putMany(s.orgId, [del("parties", id)]);
  await audit(s, "party.deleted", p.name);
}

export const listParties = async (orgId: string) =>
  (await db().list<Party>(orgId, "parties")).sort((a, b) => a.name.localeCompare(b.name));

// ───────────────────────── items ─────────────────────────

export interface ItemInput { name: string; hsn?: string; rate: number; gstRate: number; kind: "goods" | "service" }

export const listItems = async (orgId: string) => (await db().list<Item>(orgId, "items")).sort((a, b) => a.name.localeCompare(b.name));

export async function saveItem(s: SessionUser, input: ItemInput, id?: string) {
  const prev = id ? await db().get<Item>(s.orgId, "items", id) : null;
  if (id && !prev) throw new HttpError(404, "Item not found");
  const it: Item = { id: id ?? newId(), createdAt: prev?.createdAt ?? nowIso(), ...input, name: input.name.trim(), hsn: input.hsn || undefined };
  await db().put(s.orgId, "items", it);
  await audit(s, id ? "item.updated" : "item.created", it.name);
  return it;
}

export async function deleteItem(s: SessionUser, id: string) {
  const it = await db().get<Item>(s.orgId, "items", id);
  if (!it) throw new HttpError(404, "Item not found");
  await db().putMany(s.orgId, [del("items", id)]);
  await audit(s, "item.deleted", it.name);
}

// ───────────────────────── transactions ─────────────────────────

export interface TxnInput { date: string; description: string; partyName?: string; amount: number; direction: TxnDirection; account?: string; source: TxnSource; receipt?: boolean; notes?: string }

export async function createTransaction(s: SessionUser, input: TxnInput, extra: Partial<Transaction> = {}) {
  await assertOpen(s.orgId, extra.date ?? input.date);
  const suggestion = suggestAccount(input.description, input.direction);
  const account = input.account || suggestion.account;
  if (!accountType(account)) throw new HttpError(400, "Unknown account");
  // Employee claims wait for finance review before they hit the books.
  const status = s.role === "employee" ? "pending_review" : "posted";
  const t: Transaction = {
    id: newId(), date: input.date, description: input.description.trim(), partyName: input.partyName || undefined,
    amount: round2(input.amount), direction: input.direction, account, source: input.source,
    receipt: Boolean(input.receipt), notes: input.notes || (input.account ? undefined : `Auto-categorised: ${suggestion.reason}`),
    status, createdBy: s.uid, createdAt: nowIso(), ...extra,
  };
  const ops: Op[] = [{ col: "transactions", doc: t }];
  if (status === "posted") ops.push({ col: "journal", doc: txnEntry(t) });
  await db().putMany(s.orgId, ops);
  await audit(s, "transaction.created", t.description, `${t.direction} ${t.amount}`);
  return t;
}

export async function listTransactions(s: SessionUser) {
  let all = await db().list<Transaction>(s.orgId, "transactions");
  if (!can(s.role, "books:read")) all = all.filter((t) => t.createdBy === s.uid);
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export interface TxnPatch { description?: string; amount?: number; date?: string; partyName?: string; account?: string; receipt?: boolean; notes?: string; status?: "posted" }

export async function updateTransaction(s: SessionUser, id: string, patch: TxnPatch) {
  const t = await db().get<Transaction>(s.orgId, "transactions", id);
  if (!t) throw new HttpError(404, "Transaction not found");
  await assertOpen(s.orgId, t.date, patch.date);
  const finance = can(s.role, "txn:edit");
  const isOwner = t.createdBy === s.uid;
  const coreEdit = patch.description !== undefined || patch.amount !== undefined || patch.date !== undefined || patch.partyName !== undefined;
  if (!finance) {
    if (!isOwner) throw new HttpError(403, "You can only change your own expenses");
    if (patch.account !== undefined || patch.status !== undefined) throw new HttpError(403, "Finance sets the category and approves claims");
    if (coreEdit && t.status !== "pending_review") throw new HttpError(403, "This claim is already approved; ask finance to change it");
  }
  if (t.linkedType && (coreEdit || patch.account)) throw new HttpError(400, "Payments are changed from their invoice, bill or claim");
  if (t.reimbursedAt && coreEdit) throw new HttpError(400, "This claim has been reimbursed and can no longer be changed");
  if (patch.account && !accountType(patch.account)) throw new HttpError(400, "Unknown account");
  const next: Transaction = { ...t, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  if (patch.amount !== undefined) next.amount = round2(patch.amount);
  const ops: Op[] = [{ col: "transactions", doc: next }];
  // Re-post with the same journal id so the ledger always mirrors the latest values.
  if (next.status === "posted" && !next.linkedType) ops.push({ col: "journal", doc: txnEntry(next) });
  await db().putMany(s.orgId, ops);
  await audit(s, patch.status === "posted" ? "claim.approved" : "transaction.updated", t.description, Object.keys(patch).join(", "));
  return next;
}

export async function deleteTransaction(s: SessionUser, id: string) {
  const t = await db().get<Transaction>(s.orgId, "transactions", id);
  if (!t) throw new HttpError(404, "Transaction not found");
  const own = t.createdBy === s.uid && t.status === "pending_review";
  if (!can(s.role, "txn:edit") && !own) throw new HttpError(403, "You cannot delete this transaction");
  if (t.linkedType) throw new HttpError(400, "Payments are removed from their invoice, bill or claim");
  if (t.reimbursedAt) throw new HttpError(400, "Reimbursed claims cannot be deleted");
  await assertOpen(s.orgId, t.date);
  const ops: Op[] = [del("transactions", id), del("journal", `txn-${id}`)];
  if (t.bankLineId) {
    const line = await db().get<BankLine>(s.orgId, "bank_lines", t.bankLineId);
    if (line) ops.push({ col: "bank_lines", doc: { ...line, matchedTxnId: undefined } as BankLine });
  }
  await db().putMany(s.orgId, ops);
  await audit(s, "transaction.deleted", t.description, String(t.amount));
}

/** Pays an approved employee claim back from the bank. */
export async function reimburseClaim(s: SessionUser, id: string, opts: PaymentOpts = {}) {
  const t = await db().get<Transaction>(s.orgId, "transactions", id);
  if (!t) throw new HttpError(404, "Claim not found");
  if (t.source !== "claim" || t.direction !== "out") throw new HttpError(400, "Only employee claims are reimbursed");
  if (t.status !== "posted") throw new HttpError(400, "Approve the claim before reimbursing it");
  if (t.reimbursedAt) throw new HttpError(400, "Already reimbursed");
  const date = opts.date ?? todayIst();
  await assertOpen(s.orgId, date);
  const pay: Transaction = {
    id: newId(), date, description: `Reimbursement: ${t.description}`, partyName: t.partyName, amount: t.amount, direction: "out",
    account: REIMB, source: "bank", receipt: true, status: "posted", linkedType: "reimbursement", linkedId: t.id,
    paymentMode: opts.mode ?? "Bank transfer (NEFT/RTGS/IMPS)", reference: opts.reference, createdBy: s.uid, createdAt: nowIso(),
  };
  const j = entry(`reimb-${t.id}`, date, pay.description, "reimbursement", t.id, [dr(REIMB, t.amount), cr(BANK, t.amount)]);
  await db().putMany(s.orgId, [{ col: "transactions", doc: { ...t, reimbursedAt: date } as Transaction }, { col: "transactions", doc: pay }, { col: "journal", doc: j }]);
  await audit(s, "claim.reimbursed", t.description, String(t.amount));
  return { ...t, reimbursedAt: date };
}

export async function attachReceipt(s: SessionUser, id: string, file: { name: string; type: string; data: Buffer }) {
  const t = await db().get<Transaction>(s.orgId, "transactions", id);
  if (!t) throw new HttpError(404, "Transaction not found");
  if (!can(s.role, "txn:edit") && t.createdBy !== s.uid) throw new HttpError(403, "You can only add receipts to your own expenses");
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `receipts/${s.orgId}/${t.id}/${Date.now()}-${safe}`;
  await db().saveFile(path, file.data, file.type);
  const next: Transaction = { ...t, receipt: true, receiptName: file.name, receiptPath: path };
  await db().put(s.orgId, "transactions", next);
  await audit(s, "receipt.attached", t.description, file.name);
  return next;
}

export async function readReceipt(s: SessionUser, id: string) {
  const t = await db().get<Transaction>(s.orgId, "transactions", id);
  if (!t?.receiptPath) throw new HttpError(404, "No receipt file");
  if (!can(s.role, "books:read") && t.createdBy !== s.uid) throw new HttpError(403, "Not allowed");
  const f = await db().readFile(t.receiptPath);
  if (!f) throw new HttpError(404, "Receipt file is missing (demo data resets when the server restarts)");
  return { ...f, name: t.receiptName ?? "receipt" };
}

// ───────────────────────── bills (accounts payable) ─────────────────────────

export interface BillInput { vendorId: string; billNumber: string; billDate: string; dueDate: string; account: string; items: LineItem[]; tdsSection?: string }
export interface PaymentOpts { date?: string; mode?: PaymentMode; reference?: string; amount?: number }

async function buildBill(s: SessionUser, input: BillInput, existing?: Bill): Promise<Bill> {
  const org = await getOrg(s.orgId);
  const vendor = await db().get<Party>(s.orgId, "parties", input.vendorId);
  if (!vendor || vendor.type !== "vendor") throw new HttpError(400, "Choose a vendor");
  if (accountType(input.account) !== "expense") throw new HttpError(400, "Bills must use an expense account");
  await assertOpen(s.orgId, input.billDate, existing?.billDate);
  checkRates(input.items, input.billDate);
  const dupe = (await db().list<Bill>(s.orgId, "bills")).find(
    (b) => b.id !== existing?.id && b.vendorId === vendor.id && b.billNumber.trim().toLowerCase() === input.billNumber.trim().toLowerCase() && b.status !== "rejected",
  );
  if (dupe) throw new HttpError(409, `Possible duplicate: bill ${dupe.billNumber} from ${vendor.name} already exists`, "duplicate");
  // Purchase: supplier is the vendor, place of supply is our state.
  const tax = computeTax(input.items, vendor.stateCode, org.stateCode);
  const tds = tdsSection(input.tdsSection || undefined);
  return {
    id: existing?.id ?? newId(), vendorId: vendor.id, vendorName: vendor.name, vendorGstin: vendor.gstin, billNumber: input.billNumber.trim(),
    billDate: input.billDate, dueDate: input.dueDate, account: input.account, items: input.items, ...tax,
    status: "pending_approval", approvalsRequired: tax.total >= org.approvalThreshold ? 2 : 1, approvals: [], amountPaid: 0,
    tdsSection: tds?.code, tdsRate: tds?.rate, tdsAmount: tds ? tdsOn(tax.subtotal, tds.code) : undefined,
    msmeDeadline: msmeDeadline(input.billDate, input.dueDate, vendor),
    createdBy: existing?.createdBy ?? s.uid, createdAt: existing?.createdAt ?? nowIso(),
  };
}

export async function createBill(s: SessionUser, input: BillInput) {
  const b = await buildBill(s, input);
  await db().put(s.orgId, "bills", b);
  await audit(s, "bill.created", `${b.vendorName} ${b.billNumber}`, String(b.total));
  return b;
}

/** Bills can be changed only before they are approved (or after rejection); editing restarts approval. */
export async function updateBill(s: SessionUser, id: string, input: BillInput) {
  const prev = await db().get<Bill>(s.orgId, "bills", id);
  if (!prev) throw new HttpError(404, "Bill not found");
  if (prev.status !== "pending_approval" && prev.status !== "rejected") throw new HttpError(400, "Approved bills cannot be edited");
  const b = await buildBill(s, input, prev);
  b.createdBy = s.uid; // the editor becomes the maker, so they cannot approve their own change
  await db().put(s.orgId, "bills", b);
  await audit(s, "bill.updated", `${b.vendorName} ${b.billNumber}`, "approval restarted");
  return b;
}

export async function deleteBill(s: SessionUser, id: string) {
  const b = await db().get<Bill>(s.orgId, "bills", id);
  if (!b) throw new HttpError(404, "Bill not found");
  if (b.status !== "pending_approval" && b.status !== "rejected") throw new HttpError(400, "Only unapproved or rejected bills can be deleted");
  await assertOpen(s.orgId, b.billDate);
  await db().putMany(s.orgId, [del("bills", id)]);
  await audit(s, "bill.deleted", `${b.vendorName} ${b.billNumber}`);
}

export const listBills = async (orgId: string) =>
  (await db().list<Bill>(orgId, "bills")).map((b) => ({ ...b, amountPaid: b.amountPaid ?? 0 })).sort((a, b) => b.billDate.localeCompare(a.billDate));

/** Why the current user can or cannot approve this bill. Shared by the API and the inbox. */
export function approvalBlocker(s: SessionUser, b: Bill): string | null {
  if (b.status !== "pending_approval") return "This bill is not waiting for approval";
  if (!can(s.role, "bill:approve")) return "Your role cannot approve bills";
  if (b.createdBy === s.uid) return "You created this bill, so someone else must approve it (maker-checker)";
  if (b.approvals.some((a) => a.by === s.uid)) return "You have already approved this bill";
  const isFinal = b.approvals.length + 1 >= b.approvalsRequired;
  if (b.approvalsRequired > 1 && isFinal && s.role !== "admin") return "Bills above the threshold need a final approval from an admin";
  return null;
}

export async function decideBill(s: SessionUser, id: string, decision: "approved" | "rejected", comment?: string) {
  const b = await db().get<Bill>(s.orgId, "bills", id);
  if (!b) throw new HttpError(404, "Bill not found");
  const blocker = approvalBlocker(s, b);
  if (blocker) throw new HttpError(403, blocker);
  await assertOpen(s.orgId, b.billDate); // the final approval posts to the ledger on the bill date
  b.approvals.push({ by: s.uid, byName: s.name, role: s.role, at: nowIso(), decision, comment: comment || undefined });
  const ops: Op[] = [];
  if (decision === "rejected") b.status = "rejected";
  else if (b.approvals.filter((a) => a.decision === "approved").length >= b.approvalsRequired) {
    b.status = "approved";
    ops.push({ col: "journal", doc: billEntry(b) }); // accrual: expense (+ input GST if registered) recognised on approval
  }
  ops.unshift({ col: "bills", doc: b });
  await db().putMany(s.orgId, ops);
  await audit(s, `bill.${decision}`, `${b.vendorName} ${b.billNumber}`, comment);
  return b;
}

/** Records a full or partial payment against an approved bill. */
export async function payBill(s: SessionUser, id: string, opts: PaymentOpts = {}) {
  const b = await db().get<Bill>(s.orgId, "bills", id);
  if (!b) throw new HttpError(404, "Bill not found");
  if (b.status !== "approved") throw new HttpError(400, "Only approved, unpaid bills can be paid");
  const balance = billBalance({ ...b, amountPaid: b.amountPaid ?? 0 });
  const amount = round2(opts.amount ?? balance);
  if (amount <= 0) throw new HttpError(400, "Enter an amount above zero");
  if (amount > balance + 0.001) throw new HttpError(400, `Amount is more than the balance due (${balance.toFixed(2)})`);
  const date = opts.date ?? todayIst();
  await assertOpen(s.orgId, date);
  const t: Transaction = {
    id: newId(), date, description: `Payment: ${b.vendorName} bill ${b.billNumber}`, partyName: b.vendorName,
    amount, direction: "out", account: AP, source: "bank", receipt: true, status: "posted",
    linkedType: "bill", linkedId: b.id, paymentMode: opts.mode ?? "Bank transfer (NEFT/RTGS/IMPS)", reference: opts.reference || undefined,
    createdBy: s.uid, createdAt: nowIso(),
  };
  b.amountPaid = round2((b.amountPaid ?? 0) + amount);
  if (billBalance(b) <= 0.001) { b.status = "paid"; b.paidAt = date; }
  const j = entry(`billpay-${t.id}`, date, t.description, "bill_payment", b.id, [dr(AP, amount), cr(BANK, amount)]);
  await db().putMany(s.orgId, [{ col: "bills", doc: b }, { col: "transactions", doc: t }, { col: "journal", doc: j }]);
  await audit(s, "bill.payment", `${b.vendorName} ${b.billNumber}`, String(amount));
  return b;
}

// ───────────────────────── invoices (accounts receivable) ─────────────────────────

export interface InvoiceInput { customerId: string; issueDate: string; dueDate: string; items: LineItem[]; placeOfSupply?: string; notes?: string; send: boolean }

async function buildInvoice(s: SessionUser, input: InvoiceInput, existing?: Invoice): Promise<Invoice> {
  const org = await getOrg(s.orgId);
  const cust = await db().get<Party>(s.orgId, "parties", input.customerId);
  if (!cust || cust.type !== "customer") throw new HttpError(400, "Choose a customer");
  const pos = input.placeOfSupply || cust.stateCode;
  await assertOpen(s.orgId, input.issueDate, existing?.issueDate);
  checkRates(input.items, input.issueDate);
  const tax = computeTax(input.items, org.stateCode, pos, { roundOff: org.roundOff !== false });
  const id = existing?.id ?? newId();
  return {
    id, number: existing?.number ?? `DRAFT-${id.slice(0, 6).toUpperCase()}`, customerId: cust.id, customerName: cust.name, customerGstin: cust.gstin,
    placeOfSupply: pos, issueDate: input.issueDate, dueDate: input.dueDate, items: input.items, notes: input.notes || undefined, ...tax,
    status: "draft", amountPaid: 0, amountCredited: 0, createdBy: existing?.createdBy ?? s.uid, createdAt: existing?.createdAt ?? nowIso(),
  };
}

/** Numbers the invoice (only now, so drafts never leave gaps in the GST series), posts it and creates a payment link. */
async function issue(s: SessionUser, inv: Invoice): Promise<Op[]> {
  const org = await getOrg(s.orgId);
  inv.number = await nextNumber(org, "invoice", inv.issueDate);
  inv.status = "sent";
  if (paymentLinksEnabled()) {
    const cust = await db().get<Party>(s.orgId, "parties", inv.customerId);
    try {
      const link = await createPaymentLink(s.orgId, inv, cust);
      inv.paymentLink = link.url;
      inv.paymentLinkId = link.id;
    } catch (e) {
      console.error("Payment link failed", e); // the invoice is still valid without a link
    }
  }
  return [{ col: "invoices", doc: inv }, { col: "journal", doc: invoiceEntry(inv) }];
}

export async function createInvoice(s: SessionUser, input: InvoiceInput, extra: Partial<Invoice> = {}) {
  const inv = { ...(await buildInvoice(s, input)), ...extra };
  const ops: Op[] = input.send ? await issue(s, inv) : [{ col: "invoices", doc: inv }];
  await db().putMany(s.orgId, ops);
  await audit(s, "invoice.created", inv.number, `${inv.customerName} ${inv.total}`);
  return inv;
}

export async function updateInvoice(s: SessionUser, id: string, input: InvoiceInput) {
  const prev = await getInvoice(s.orgId, id);
  if (prev.status !== "draft") throw new HttpError(400, "Only drafts can be edited; use a credit note to correct a sent invoice");
  const inv = await buildInvoice(s, input, prev);
  const ops: Op[] = input.send ? await issue(s, inv) : [{ col: "invoices", doc: inv }];
  await db().putMany(s.orgId, ops);
  await audit(s, "invoice.updated", inv.number);
  return inv;
}

export async function deleteInvoice(s: SessionUser, id: string) {
  const inv = await getInvoice(s.orgId, id);
  if (inv.status !== "draft") throw new HttpError(400, "Only drafts can be deleted; void a sent invoice instead");
  await assertOpen(s.orgId, inv.issueDate);
  await db().putMany(s.orgId, [del("invoices", id)]);
  await audit(s, "invoice.deleted", inv.number);
}

const normInvoice = (i: Invoice): Invoice => ({ ...i, amountPaid: i.amountPaid ?? 0, amountCredited: i.amountCredited ?? 0 });

export const listInvoices = async (orgId: string) =>
  (await db().list<Invoice>(orgId, "invoices")).map(normInvoice).sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));

export async function getInvoice(orgId: string, id: string) {
  const inv = await db().get<Invoice>(orgId, "invoices", id);
  if (!inv) throw new HttpError(404, "Invoice not found");
  return normInvoice(inv);
}

/** Records a full or partial customer payment. */
export async function recordInvoicePayment(s: SessionUser, id: string, opts: PaymentOpts = {}) {
  const inv = await getInvoice(s.orgId, id);
  if (inv.status !== "sent") throw new HttpError(400, "Only sent, unpaid invoices can receive payments");
  const balance = invoiceBalance(inv);
  const amount = round2(opts.amount ?? balance);
  if (amount <= 0) throw new HttpError(400, "Enter an amount above zero");
  if (amount > balance + 0.001) throw new HttpError(400, `Amount is more than the balance due (${balance.toFixed(2)})`);
  const date = opts.date ?? todayIst();
  await assertOpen(s.orgId, date);
  const t: Transaction = {
    id: newId(), date, description: `Receipt: invoice ${inv.number} from ${inv.customerName}`, partyName: inv.customerName,
    amount, direction: "in", account: AR, source: "bank", receipt: true, status: "posted",
    linkedType: "invoice", linkedId: inv.id, paymentMode: opts.mode ?? "Bank transfer (NEFT/RTGS/IMPS)", reference: opts.reference || undefined,
    createdBy: s.uid, createdAt: nowIso(),
  };
  inv.amountPaid = round2(inv.amountPaid + amount);
  if (invoiceBalance(inv) <= 0.001) { inv.status = "paid"; inv.paidAt = date; }
  const j = entry(`invpay-${t.id}`, date, t.description, "invoice_payment", inv.id, [dr(BANK, amount), cr(AR, amount)]);
  await db().putMany(s.orgId, [{ col: "invoices", doc: inv }, { col: "transactions", doc: t }, { col: "journal", doc: j }]);
  await audit(s, "invoice.payment", inv.number, String(amount));
  return inv;
}

export async function invoiceAction(s: SessionUser, id: string, action: "send" | "void") {
  const inv = await getInvoice(s.orgId, id);
  let ops: Op[];
  if (action === "send") {
    if (inv.status !== "draft") throw new HttpError(400, "Only drafts can be sent");
    ops = await issue(s, inv);
  } else {
    if (inv.status === "void") throw new HttpError(400, "Already void");
    await assertOpen(s.orgId, inv.issueDate);
    if (inv.status === "draft") throw new HttpError(400, "Delete a draft instead of voiding it");
    if (inv.amountPaid > 0 || inv.amountCredited > 0) throw new HttpError(400, "This invoice has payments or credit notes; issue a credit note for the balance instead");
    inv.status = "void";
    ops = [{ col: "invoices", doc: inv }, { col: "journal", doc: { ...invoiceEntry(inv), memo: `VOID ${inv.number}`, lines: [] } as JournalEntry }];
  }
  await db().putMany(s.orgId, ops);
  await audit(s, `invoice.${action}`, inv.number);
  return inv;
}

// ───────────────────────── credit notes ─────────────────────────

export interface CreditNoteInput { invoiceId: string; date: string; reason: string; items: LineItem[] }

export async function createCreditNote(s: SessionUser, input: CreditNoteInput) {
  const org = await getOrg(s.orgId);
  const inv = await getInvoice(s.orgId, input.invoiceId);
  if (inv.status !== "sent") throw new HttpError(400, "Credit notes apply to sent invoices with a balance due");
  await assertOpen(s.orgId, input.date);
  checkRates(input.items, inv.issueDate); // a credit note carries the original invoice's rates
  const tax = computeTax(input.items, org.stateCode, inv.placeOfSupply);
  const balance = invoiceBalance(inv);
  if (tax.total > balance + 0.001) throw new HttpError(400, `Credit (${tax.total.toFixed(2)}) is more than the balance due (${balance.toFixed(2)})`);
  const cn: CreditNote = {
    id: newId(), number: await nextNumber(org, "credit_note", input.date), invoiceId: inv.id, invoiceNumber: inv.number,
    customerId: inv.customerId, customerName: inv.customerName, date: input.date, reason: input.reason.trim(), items: input.items, ...tax,
    createdBy: s.uid, createdAt: nowIso(),
  };
  inv.amountCredited = round2(inv.amountCredited + cn.total);
  if (invoiceBalance(inv) <= 0.001) { inv.status = "paid"; inv.paidAt = input.date; }
  await db().putMany(s.orgId, [{ col: "credit_notes", doc: cn }, { col: "invoices", doc: inv }, { col: "journal", doc: creditNoteEntry(cn) }]);
  await audit(s, "credit_note.created", cn.number, `${inv.number} ${cn.total}`);
  return cn;
}

export const listCreditNotes = async (orgId: string) =>
  (await db().list<CreditNote>(orgId, "credit_notes")).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

// ───────────────────────── recurring invoices ─────────────────────────

export interface RecurringInput { name: string; customerId: string; items: LineItem[]; frequency: RecurringProfile["frequency"]; paymentTermsDays: number; nextDate: string; endDate?: string; autoSend: boolean; active: boolean }

const advance = (d: string, f: RecurringProfile["frequency"]) =>
  f === "weekly" ? addDays(d, 7) : f === "monthly" ? addMonths(d, 1) : f === "quarterly" ? addMonths(d, 3) : addMonths(d, 12);

export const listRecurring = async (orgId: string) => (await db().list<RecurringProfile>(orgId, "recurring")).sort((a, b) => a.nextDate.localeCompare(b.nextDate));

export async function saveRecurring(s: SessionUser, input: RecurringInput, id?: string) {
  const prev = id ? await db().get<RecurringProfile>(s.orgId, "recurring", id) : null;
  if (id && !prev) throw new HttpError(404, "Profile not found");
  const cust = await db().get<Party>(s.orgId, "parties", input.customerId);
  if (!cust || cust.type !== "customer") throw new HttpError(400, "Choose a customer");
  const p: RecurringProfile = {
    ...prev, ...input, id: id ?? newId(), customerName: cust.name, endDate: input.endDate || undefined,
    createdBy: prev?.createdBy ?? s.uid, createdAt: prev?.createdAt ?? nowIso(),
  };
  await db().put(s.orgId, "recurring", p);
  await audit(s, id ? "recurring.updated" : "recurring.created", p.name);
  return p;
}

export async function deleteRecurring(s: SessionUser, id: string) {
  const p = await db().get<RecurringProfile>(s.orgId, "recurring", id);
  if (!p) throw new HttpError(404, "Profile not found");
  await db().putMany(s.orgId, [del("recurring", id)]);
  await audit(s, "recurring.deleted", p.name);
}

/** Creates every invoice that is due (catching up missed runs, at most 24 per profile). Safe to call repeatedly. */
export async function runRecurring(orgId: string, upTo = todayIst()) {
  const s = SYSTEM(orgId);
  const created: Invoice[] = [];
  for (const p of await listRecurring(orgId)) {
    if (!p.active) continue;
    let guard = 0;
    while (p.nextDate <= upTo && (!p.endDate || p.nextDate <= p.endDate) && guard++ < 24) {
      const inv = await createInvoice(s, { customerId: p.customerId, issueDate: p.nextDate, dueDate: addDays(p.nextDate, p.paymentTermsDays), items: p.items, send: p.autoSend }, { recurringId: p.id });
      created.push(inv);
      p.lastInvoiceId = inv.id;
      p.nextDate = advance(p.nextDate, p.frequency);
      await audit(s, "recurring.invoice_created", p.name, inv.number);
    }
    if (p.endDate && p.nextDate > p.endDate) p.active = false;
    await db().put(orgId, "recurring", p);
  }
  return created;
}

// ───────────────────────── payments ─────────────────────────

export async function listPayments(orgId: string, kind: "received" | "made"): Promise<PaymentRow[]> {
  const refType: "invoice" | "bill" = kind === "received" ? "invoice" : "bill";
  const txns = (await db().list<Transaction>(orgId, "transactions")).filter((t) => t.linkedType === refType)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const refs = new Map<string, string>();
  if (refType === "invoice") for (const i of await db().list<Invoice>(orgId, "invoices")) refs.set(i.id, i.number);
  else for (const b of await db().list<Bill>(orgId, "bills")) refs.set(b.id, b.billNumber);
  const prefix = kind === "received" ? "PR-" : "PM-";
  return txns.map((t, k) => ({
    id: t.id, number: `${prefix}${String(k + 1).padStart(5, "0")}`, date: t.date, partyName: t.partyName ?? "",
    refType, refId: t.linkedId!, refNumber: refs.get(t.linkedId!) ?? "", mode: t.paymentMode ?? "Bank transfer (NEFT/RTGS/IMPS)",
    reference: t.reference, amount: t.amount,
  })).reverse();
}

// ───────────────────────── bank statement import & reconciliation ─────────────────────────

/** Parses common Indian bank CSV exports: a date column, a narration column, and either debit/credit or a signed amount. */
export function parseBankCsv(text: string): Omit<BankLine, "id" | "importId" | "createdAt">[] {
  const rows = text.replace(/\r/g, "").split("\n").filter((l) => l.trim()).map(splitCsv);
  const hi = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /narration|description|particulars|details|remarks/i.test(c)));
  if (hi < 0) throw new HttpError(400, "Could not find a header row with Date and Narration/Description columns");
  const h = rows[hi].map((c) => c.toLowerCase());
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const cDate = col(/date/), cDesc = col(/narration|description|particulars|details|remarks/);
  const cDebit = col(/withdraw|debit|dr\b/), cCredit = col(/deposit|credit|cr\b/), cAmt = col(/^amount|amount$/);
  const cRef = col(/ref|chq|cheque|utr/);
  if (cDebit < 0 && cCredit < 0 && cAmt < 0) throw new HttpError(400, "Need Debit/Credit (or Withdrawal/Deposit) columns, or a signed Amount column");
  const num = (v?: string) => { const n = Number((v ?? "").replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1")); return Number.isFinite(n) ? n : 0; };
  const out: Omit<BankLine, "id" | "importId" | "createdAt">[] = [];
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[cDate]);
    if (!date) continue;
    let amount = 0;
    let direction: TxnDirection = "out";
    if (cDebit >= 0 || cCredit >= 0) {
      const d = num(r[cDebit]), c = num(r[cCredit]);
      if (c > 0) { amount = c; direction = "in"; } else if (d > 0) { amount = d; direction = "out"; } else continue;
    } else {
      const a = num(r[cAmt]);
      if (!a) continue;
      amount = Math.abs(a); direction = a > 0 ? "in" : "out";
    }
    out.push({ date, description: (r[cDesc] ?? "").trim() || "(no narration)", amount: round2(amount), direction, reference: cRef >= 0 ? r[cRef]?.trim() || undefined : undefined });
  }
  if (!out.length) throw new HttpError(400, "No transactions found in the file");
  return out;
}

function splitCsv(line: string) {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function parseDate(v?: string): string | null {
  if (!v) return null;
  v = v.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // dd/mm/yyyy (Indian banks)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  m = v.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3})[a-z]*[\s\-\/,]+(\d{2,4})$/); // 05-Nov-2026
  if (m) { const mi = MONTHS.indexOf(m[2].toLowerCase()); if (mi < 0) return null; const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}

export async function importBankStatement(s: SessionUser, csv: string) {
  const parsed = parseBankCsv(csv);
  const existing = await db().list<BankLine>(s.orgId, "bank_lines");
  const key = (l: { date: string; amount: number; direction: string; description: string }) => `${l.date}|${l.amount}|${l.direction}|${l.description}`;
  const seen = new Set(existing.map(key));
  const importId = newId();
  const fresh: BankLine[] = parsed.filter((l) => !seen.has(key(l))).map((l) => ({ ...l, id: newId(), importId, createdAt: nowIso() }));
  await db().putMany(s.orgId, fresh.map((doc) => ({ col: "bank_lines", doc })));
  await audit(s, "bank.imported", `${fresh.length} lines`, `${parsed.length - fresh.length} duplicates skipped`);
  return { imported: fresh.length, skipped: parsed.length - fresh.length };
}

export async function reconciliation(s: SessionUser) {
  const lines = (await db().list<BankLine>(s.orgId, "bank_lines")).sort((a, b) => b.date.localeCompare(a.date));
  const txns = (await db().list<Transaction>(s.orgId, "transactions")).filter((t) => t.status === "posted" && t.source !== "claim");
  const used = new Set(lines.map((l) => l.matchedTxnId).filter(Boolean));
  const suggestions: Record<string, { txn: Transaction; score: number; reason: string }[]> = {};
  for (const l of lines.filter((x) => !x.matchedTxnId)) {
    suggestions[l.id] = txns
      .filter((t) => !used.has(t.id) && !t.bankLineId && t.direction === l.direction && Math.abs(t.amount - l.amount) < 0.01)
      .map((t) => {
        const days = Math.abs(Date.parse(t.date) - Date.parse(l.date)) / 864e5;
        const words = l.description.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
        const nameHit = words.some((w) => `${t.description} ${t.partyName ?? ""}`.toLowerCase().includes(w));
        return { txn: t, score: (days <= 5 ? 50 - days * 5 : 0) + (nameHit ? 30 : 0) + 20, reason: `Same amount${days <= 5 ? `, ${days === 0 ? "same day" : `${days} day${days === 1 ? "" : "s"} apart`}` : ""}${nameHit ? ", similar description" : ""}` };
      })
      .filter((x) => x.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }
  const matched = lines.filter((l) => l.matchedTxnId).length;
  return { lines, suggestions, summary: { total: lines.length, matched, unmatched: lines.length - matched } };
}

export async function matchBankLine(s: SessionUser, lineId: string, txnId: string) {
  const line = await db().get<BankLine>(s.orgId, "bank_lines", lineId);
  const t = await db().get<Transaction>(s.orgId, "transactions", txnId);
  if (!line || !t) throw new HttpError(404, "Not found");
  if (line.matchedTxnId) throw new HttpError(400, "This statement line is already matched");
  if (t.bankLineId) throw new HttpError(400, "That transaction is already matched to another line");
  if (t.direction !== line.direction || Math.abs(t.amount - line.amount) > 0.01) throw new HttpError(400, "Amount or direction does not match");
  await db().putMany(s.orgId, [{ col: "bank_lines", doc: { ...line, matchedTxnId: t.id } as BankLine }, { col: "transactions", doc: { ...t, bankLineId: line.id } as Transaction }]);
  await audit(s, "bank.matched", line.description, String(line.amount));
}

export async function unmatchBankLine(s: SessionUser, lineId: string) {
  const line = await db().get<BankLine>(s.orgId, "bank_lines", lineId);
  if (!line?.matchedTxnId) throw new HttpError(400, "Not matched");
  const t = await db().get<Transaction>(s.orgId, "transactions", line.matchedTxnId);
  const ops: Op[] = [{ col: "bank_lines", doc: { ...line, matchedTxnId: undefined } as BankLine }];
  if (t) ops.push({ col: "transactions", doc: { ...t, bankLineId: undefined } as Transaction });
  await db().putMany(s.orgId, ops);
  await audit(s, "bank.unmatched", line.description);
}

/** Books an unmatched statement line as a new transaction (auto-categorised unless an account is given) and matches it. */
export async function createFromBankLine(s: SessionUser, lineId: string, account?: string) {
  const line = await db().get<BankLine>(s.orgId, "bank_lines", lineId);
  if (!line) throw new HttpError(404, "Not found");
  if (line.matchedTxnId) throw new HttpError(400, "Already matched");
  const t = await createTransaction(s, { date: line.date, description: line.description, amount: line.amount, direction: line.direction, account, source: "bank", receipt: false, notes: line.reference ? `Bank ref ${line.reference}` : undefined }, { bankLineId: line.id });
  await db().put(s.orgId, "bank_lines", { ...line, matchedTxnId: t.id });
  return t;
}

export async function deleteBankLine(s: SessionUser, lineId: string) {
  const line = await db().get<BankLine>(s.orgId, "bank_lines", lineId);
  if (!line) throw new HttpError(404, "Not found");
  if (line.matchedTxnId) throw new HttpError(400, "Unmatch the line before deleting it");
  await db().putMany(s.orgId, [del("bank_lines", lineId)]);
}

// ───────────────────────── reports ─────────────────────────

const journal = (orgId: string) => db().list<JournalEntry>(orgId, "journal");

function balances(entries: JournalEntry[], from?: string, to?: string) {
  const m = new Map<string, number>(); // debit - credit
  for (const e of entries) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    for (const l of e.lines) m.set(l.account, round2((m.get(l.account) ?? 0) + l.debit - l.credit));
  }
  return m;
}

export async function profitAndLoss(orgId: string, from: string, to: string, entries?: JournalEntry[]) {
  const b = balances(entries ?? (await journal(orgId)), from, to);
  const rows = (type: "income" | "expense") =>
    ACCOUNTS.filter((a) => a.type === type)
      .map((a) => ({ code: a.code, name: a.name, amount: round2((type === "income" ? -1 : 1) * (b.get(a.code) ?? 0)) }))
      .filter((r) => r.amount !== 0);
  const income = rows("income");
  const expenses = rows("expense");
  const totalIncome = round2(income.reduce((a, r) => a + r.amount, 0));
  const totalExpenses = round2(expenses.reduce((a, r) => a + r.amount, 0));
  return { from, to, income, expenses, totalIncome, totalExpenses, netProfit: round2(totalIncome - totalExpenses) };
}

export async function balanceSheet(orgId: string, asOf: string) {
  const b = balances(await journal(orgId), undefined, asOf);
  const pick = (type: "asset" | "liability" | "equity", sign: number) =>
    ACCOUNTS.filter((a) => a.type === type).map((a) => ({ code: a.code, name: a.name, amount: round2(sign * (b.get(a.code) ?? 0)) })).filter((r) => r.amount !== 0);
  const earnings = round2(-ACCOUNTS.filter((a) => a.type === "income" || a.type === "expense").reduce((s, a) => s + (b.get(a.code) ?? 0), 0));
  const assets = pick("asset", 1);
  const liabilities = pick("liability", -1);
  const equity = [...pick("equity", -1), { code: "RE", name: "Retained earnings", amount: earnings }];
  const sum = (r: { amount: number }[]) => round2(r.reduce((a, x) => a + x.amount, 0));
  return { asOf, assets, liabilities, equity, totalAssets: sum(assets), totalLiabilities: sum(liabilities), totalEquity: sum(equity) };
}

export async function trialBalance(orgId: string, asOf: string) {
  const b = balances(await journal(orgId), undefined, asOf);
  const rows = ACCOUNTS.map((a) => {
    const v = b.get(a.code) ?? 0;
    return { code: a.code, name: a.name, type: a.type, debit: v > 0 ? round2(v) : 0, credit: v < 0 ? round2(-v) : 0 };
  }).filter((r) => r.debit || r.credit);
  return { asOf, rows, totalDebit: round2(rows.reduce((a, r) => a + r.debit, 0)), totalCredit: round2(rows.reduce((a, r) => a + r.credit, 0)) };
}

export async function generalLedger(orgId: string, account: string, from: string, to: string) {
  if (!accountType(account)) throw new HttpError(400, "Unknown account");
  const entries = (await journal(orgId)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  let opening = 0;
  const rows: { date: string; memo: string; voucher: string; debit: number; credit: number; balance: number }[] = [];
  for (const e of entries) for (const l of e.lines) {
    if (l.account !== account) continue;
    if (e.date < from) { opening = round2(opening + l.debit - l.credit); continue; }
    if (e.date > to) continue;
    rows.push({ date: e.date, memo: e.memo, voucher: e.id, debit: l.debit, credit: l.credit, balance: 0 });
  }
  let run = opening;
  for (const r of rows) { run = round2(run + r.debit - r.credit); r.balance = run; }
  return { account, name: accountName(account), from, to, opening, closing: run, rows };
}

/** Receivables or payables by party in 0–30 / 31–60 / 61–90 / 90+ days overdue buckets. */
export async function ageing(orgId: string, kind: "receivables" | "payables", asOf = todayIst()) {
  const docs = kind === "receivables"
    ? (await listInvoices(orgId)).filter((i) => i.status === "sent").map((i) => ({ party: i.customerName, partyId: i.customerId, due: i.dueDate, amount: invoiceBalance(i), ref: i.number, id: i.id }))
    : (await listBills(orgId)).filter((b) => b.status === "approved").map((b) => ({ party: b.vendorName, partyId: b.vendorId, due: b.dueDate, amount: billBalance(b), ref: b.billNumber, id: b.id }));
  const buckets = ["current", "1-30", "31-60", "61-90", "90+"] as const;
  const bucketOf = (due: string) => {
    const d = Math.round((Date.parse(asOf) - Date.parse(due)) / 864e5);
    return d <= 0 ? "current" : d <= 30 ? "1-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+";
  };
  const byParty = new Map<string, { party: string; partyId: string } & Record<(typeof buckets)[number] | "total", number>>();
  for (const d of docs) {
    const row = byParty.get(d.partyId) ?? { party: d.party, partyId: d.partyId, current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0, total: 0 };
    row[bucketOf(d.due)] = round2(row[bucketOf(d.due)] + d.amount);
    row.total = round2(row.total + d.amount);
    byParty.set(d.partyId, row);
  }
  const rows = [...byParty.values()].sort((a, b) => b.total - a.total);
  const totals = Object.fromEntries([...buckets, "total"].map((k) => [k, round2(rows.reduce((a, r) => a + Number(r[k as keyof typeof r]), 0))]));
  return { kind, asOf, buckets, rows, totals };
}

const monthKey = (d: string) => d.slice(0, 7);

function monthsBack(n: number) {
  const t = todayIst();
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) - 1;
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - (n - 1 - i), 1)).toISOString().slice(0, 7));
}

export async function cashFlowByMonth(orgId: string, months = 12, entries?: JournalEntry[]) {
  const keys = monthsBack(months);
  const map = new Map(keys.map((k) => [k, { month: k, in: 0, out: 0 }]));
  for (const e of entries ?? (await journal(orgId))) {
    if (e.refType === "opening") continue;
    const row = map.get(monthKey(e.date));
    if (!row) continue;
    for (const l of e.lines) if (l.account === BANK) { row.in = round2(row.in + l.debit); row.out = round2(row.out + l.credit); }
  }
  return [...map.values()];
}

export async function gstSummary(orgId: string, month: string, entries?: JournalEntry[]) {
  const inMonth = (entries ?? (await journal(orgId))).filter((e) => monthKey(e.date) === month);
  let output = 0, input = 0;
  for (const e of inMonth) for (const l of e.lines) {
    if (l.account === OUTPUT_GST) output += l.credit - l.debit;
    if (l.account === INPUT_GST) input += l.debit - l.credit;
  }
  const invoices = (await db().list<Invoice>(orgId, "invoices")).filter((i) => monthKey(i.issueDate) === month && i.status !== "draft" && i.status !== "void");
  const notes = (await db().list<CreditNote>(orgId, "credit_notes")).filter((c) => monthKey(c.date) === month);
  const bills = (await db().list<Bill>(orgId, "bills")).filter((b) => monthKey(b.billDate) === month && (b.status === "approved" || b.status === "paid") && b.vendorGstin);
  const sum = (rows: { cgst: number; sgst: number; igst: number; subtotal: number }[], sign = 1) => ({
    taxable: round2(sign * rows.reduce((a, r) => a + r.subtotal, 0)), cgst: round2(sign * rows.reduce((a, r) => a + r.cgst, 0)),
    sgst: round2(sign * rows.reduce((a, r) => a + r.sgst, 0)), igst: round2(sign * rows.reduce((a, r) => a + r.igst, 0)),
  });
  const b2b = invoices.filter((i) => i.customerGstin), b2c = invoices.filter((i) => !i.customerGstin);
  return {
    month, outputTax: round2(output), inputTaxCredit: round2(input), netPayable: round2(output - input),
    sales: sum(invoices), b2b: sum(b2b), b2c: sum(b2c), creditNotes: sum(notes, -1), purchases: sum(bills),
    invoiceCount: invoices.length, b2bCount: b2b.length, b2cCount: b2c.length, creditNoteCount: notes.length, billCount: bills.length,
  };
}

export async function ledgerExport(orgId: string) {
  const entries = (await journal(orgId)).filter((e) => e.lines.length).sort((a, b) => a.date.localeCompare(b.date));
  const rows = [["Date", "Voucher", "Memo", "Account code", "Account", "Debit", "Credit"]];
  for (const e of entries) for (const l of e.lines) rows.push([e.date, e.id, e.memo, l.account, accountName(l.account), l.debit ? l.debit.toFixed(2) : "", l.credit ? l.credit.toFixed(2) : ""]);
  return toCsv(rows);
}

export const toCsv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => { const v = String(c ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",")).join("\n");

// ───────────────────────── party detail & statement ─────────────────────────

export async function partyDetail(orgId: string, id: string) {
  const party = await db().get<Party>(orgId, "parties", id);
  if (!party) throw new HttpError(404, "Not found");
  const txns = (await db().list<Transaction>(orgId, "transactions"));
  type Line = { date: string; type: string; ref: string; href: string; debit: number; credit: number; balance: number };
  const lines: Line[] = [];
  let invoices: Invoice[] = [], bills: Bill[] = [], creditNotes: CreditNote[] = [];
  if (party.type === "customer") {
    invoices = (await listInvoices(orgId)).filter((i) => i.customerId === id);
    creditNotes = (await listCreditNotes(orgId)).filter((c) => c.customerId === id);
    const ids = new Set(invoices.map((i) => i.id));
    for (const i of invoices) if (i.status !== "draft" && i.status !== "void") lines.push({ date: i.issueDate, type: "Invoice", ref: i.number, href: `/invoices/${i.id}`, debit: i.total, credit: 0, balance: 0 });
    for (const c of creditNotes) lines.push({ date: c.date, type: "Credit note", ref: c.number, href: `/invoices/${c.invoiceId}`, debit: 0, credit: c.total, balance: 0 });
    for (const t of txns) if (t.linkedType === "invoice" && ids.has(t.linkedId!)) lines.push({ date: t.date, type: "Payment received", ref: t.reference ?? t.paymentMode ?? "", href: `/invoices/${t.linkedId}`, debit: 0, credit: t.amount, balance: 0 });
  } else {
    bills = (await listBills(orgId)).filter((b) => b.vendorId === id);
    const ids = new Set(bills.map((b) => b.id));
    for (const b of bills) if (b.status === "approved" || b.status === "paid") lines.push({ date: b.billDate, type: "Bill", ref: b.billNumber, href: `/bills?open=${b.id}&view=all`, debit: 0, credit: b.total, balance: 0 });
    for (const t of txns) if (t.linkedType === "bill" && ids.has(t.linkedId!)) lines.push({ date: t.date, type: "Payment made", ref: t.reference ?? t.paymentMode ?? "", href: `/bills?open=${t.linkedId}&view=all`, debit: t.amount, credit: 0, balance: 0 });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  for (const l of lines) { run = round2(run + (party.type === "customer" ? l.debit - l.credit : l.credit - l.debit)); l.balance = run; }
  const outstanding = party.type === "customer" ? invoices.reduce((a, i) => a + invoiceBalance(i), 0) : bills.reduce((a, b) => a + billBalance(b), 0);
  return { party, invoices, bills, creditNotes, statement: lines, outstanding: round2(outstanding) };
}

// ───────────────────────── search ─────────────────────────

export async function search(s: SessionUser, q: string): Promise<SearchHit[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const has = (...v: (string | number | undefined)[]) => v.some((x) => x !== undefined && String(x).toLowerCase().includes(needle));
  const hits: SearchHit[] = [];
  if (can(s.role, "books:read")) {
    for (const p of await listParties(s.orgId)) if (has(p.name, p.gstin, p.email, p.phone)) hits.push({ kind: p.type, id: p.id, title: p.name, subtitle: `${p.type === "customer" ? "Customer" : "Vendor"}${p.gstin ? ` · ${p.gstin}` : ""}`, href: `/${p.type}s/${p.id}` });
    for (const i of await listInvoices(s.orgId)) if (has(i.number, i.customerName, i.total)) hits.push({ kind: "invoice", id: i.id, title: i.number, subtitle: `Invoice · ${i.customerName} · ${fmtDate(i.issueDate)}`, href: `/invoices/${i.id}`, amount: i.total });
    for (const b of await listBills(s.orgId)) if (has(b.billNumber, b.vendorName, b.total)) hits.push({ kind: "bill", id: b.id, title: b.billNumber, subtitle: `Bill · ${b.vendorName} · ${fmtDate(b.billDate)}`, href: `/bills?open=${b.id}&view=all`, amount: b.total });
    for (const c of await listCreditNotes(s.orgId)) if (has(c.number, c.customerName, c.invoiceNumber)) hits.push({ kind: "credit_note", id: c.id, title: c.number, subtitle: `Credit note · ${c.customerName} · ${c.invoiceNumber}`, href: `/invoices/${c.invoiceId}`, amount: c.total });
  }
  for (const t of await listTransactions(s)) if (has(t.description, t.partyName, t.reference, t.amount)) hits.push({ kind: "transaction", id: t.id, title: t.description, subtitle: `Transaction · ${fmtDate(t.date)}`, href: `/transactions?open=${t.id}`, amount: t.amount });
  return hits.slice(0, 25);
}

// ───────────────────────── inbox & dashboard ─────────────────────────

export async function buildInbox(s: SessionUser): Promise<InboxItem[]> {
  const today = todayIst();
  const items: InboxItem[] = [];
  const books = can(s.role, "books:read");
  const bills = books || can(s.role, "bill:approve") ? await listBills(s.orgId) : [];

  if (can(s.role, "bill:approve")) {
    for (const b of bills) {
      if (approvalBlocker(s, b)) continue;
      const level = b.approvalsRequired > 1 ? ` (approval ${b.approvals.length + 1} of ${b.approvalsRequired})` : "";
      items.push({ kind: "bill_approval", title: `Approve bill from ${b.vendorName}${level}`, detail: `Bill ${b.billNumber}, due ${fmtDate(b.dueDate)}`, href: `/bills?open=${b.id}`, amount: b.total, dueDate: b.dueDate, severity: "high" });
    }
  }
  const txns = await listTransactions(s);
  for (const t of txns.filter((t) => t.direction === "out" && !t.receipt && !t.linkedType).slice(0, 6)) {
    items.push({ kind: "missing_receipt", title: `Receipt missing: ${t.description}`, detail: `${fmtDate(t.date)} · ${t.source}`, href: `/transactions?open=${t.id}`, amount: t.amount, severity: "medium" });
  }
  if (can(s.role, "txn:edit")) {
    for (const t of txns.filter((x) => x.status === "pending_review")) items.push({ kind: "missing_receipt", title: `Review expense claim: ${t.description}`, detail: `Submitted ${fmtDate(t.date)}`, href: `/transactions?open=${t.id}`, amount: t.amount, severity: "medium" });
    for (const t of txns.filter((x) => x.source === "claim" && x.status === "posted" && !x.reimbursedAt)) items.push({ kind: "reimbursement", title: `Reimburse: ${t.description}`, detail: `Approved claim${t.partyName ? ` · ${t.partyName}` : ""}`, href: `/transactions?open=${t.id}`, amount: t.amount, severity: "medium" });
    const unmatched = (await db().list<BankLine>(s.orgId, "bank_lines")).filter((l) => !l.matchedTxnId).length;
    if (unmatched) items.push({ kind: "reconcile", title: `${unmatched} bank statement line${unmatched === 1 ? "" : "s"} to reconcile`, detail: "Match them to your transactions", href: "/banking/reconcile", severity: "medium" });
  }
  if (books) {
    for (const inv of (await listInvoices(s.orgId)).filter((i) => i.status === "sent" && i.dueDate < today)) {
      items.push({ kind: "overdue_invoice", title: `Overdue: ${inv.customerName}`, detail: `Invoice ${inv.number} was due ${fmtDate(inv.dueDate)}`, href: `/invoices/${inv.id}`, amount: invoiceBalance(inv), dueDate: inv.dueDate, severity: "high" });
    }
    const soon = addDays(today, 7);
    for (const b of bills.filter((x) => x.status === "approved" && x.dueDate <= soon)) {
      items.push({ kind: "bill_due", title: `Pay ${b.vendorName}`, detail: b.dueDate < today ? `Overdue since ${fmtDate(b.dueDate)}` : `Due ${fmtDate(b.dueDate)}`, href: `/bills?open=${b.id}`, amount: billBalance(b), dueDate: b.dueDate, severity: b.dueDate < today ? "high" : "medium" });
    }
    // Sec 43B(h): unpaid bills from micro/small vendors must be paid by the deadline or the expense is disallowed.
    for (const b of bills.filter((x) => x.msmeDeadline && (x.status === "approved" || x.status === "pending_approval") && x.msmeDeadline <= addDays(today, 5))) {
      items.push({ kind: "msme_due", title: `MSME vendor: pay ${b.vendorName} by ${fmtDate(b.msmeDeadline!)}`, detail: b.msmeDeadline! < today ? "Past the Sec 43B(h) limit: this expense is not deductible until paid" : "Sec 43B(h): pay on time to keep the expense deductible this year", href: `/bills?open=${b.id}`, amount: billBalance(b), dueDate: b.msmeDeadline, severity: "high" });
    }
    const tdsDue = round2((await journal(s.orgId)).flatMap((e) => e.lines).filter((l) => l.account === TDS_PAYABLE).reduce((a, l) => a + l.credit - l.debit, 0));
    if (tdsDue > 0.5) items.push({ kind: "compliance", title: "TDS deducted, not yet deposited", detail: "Deposit with challan by the 7th of next month (Sec 393). Record the deposit as a transaction to account 2300.", href: "/transactions?new=1", amount: tdsDue, severity: "medium" });
    for (const c of upcomingComplianceDates(today)) items.push({ kind: "compliance", title: `${c.label} due`, detail: c.detail, href: "/reports?tab=gst", dueDate: c.date, severity: "low" });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
}

const split = (rows: { balance: number; dueDate: string }[], today: string): AgeSplit => {
  const out = { total: 0, current: 0, overdue: 0 };
  for (const r of rows) { out.total += r.balance; if (r.dueDate < today) out.overdue += r.balance; else out.current += r.balance; }
  return { total: round2(out.total), current: round2(out.current), overdue: round2(out.overdue) };
};

export async function dashboard(s: SessionUser): Promise<DashboardData & { limited: boolean }> {
  const inbox = await buildInbox(s);
  const recent = (await listTransactions(s)).slice(0, 8);
  const zero: AgeSplit = { total: 0, current: 0, overdue: 0 };
  if (!can(s.role, "books:read")) {
    return {
      limited: true, receivablesSplit: zero, payablesSplit: zero,
      fiscal: { start: "", end: "", openingCash: 0, incoming: 0, outgoing: 0, closingCash: 0, months: [] }, incomeExpense: [], topExpenses: [],
      cashBalance: 0, monthlyBurn: 0, runwayMonths: null, gstPayable: 0, receivables: 0, payables: 0, cashFlow: [], inbox, recent,
    };
  }
  const today = todayIst();
  const entries = await journal(s.orgId); // read the ledger once and reuse it for every figure below
  const b = balances(entries);
  const cashFlow = await cashFlowByMonth(s.orgId, 12, entries);
  const lastThree = cashFlow.slice(-4, -1); // last three complete months
  const burn = round2(Math.max(0, lastThree.reduce((a, m) => a + (m.out - m.in), 0) / Math.max(1, lastThree.length)));
  const cash = b.get(BANK) ?? 0;
  const gst = await gstSummary(s.orgId, today.slice(0, 7), entries);

  const fy = fiscalYear(today);
  let openingCash = 0;
  const byMonth = new Map(fy.months.map((m) => [m, { in: 0, out: 0, income: 0, expense: 0 }]));
  for (const e of entries) {
    if (e.date < fy.start) { for (const l of e.lines) if (l.account === BANK) openingCash += l.debit - l.credit; continue; }
    const row = byMonth.get(monthKey(e.date));
    if (!row) continue;
    for (const l of e.lines) {
      if (l.account === BANK && e.refType !== "opening") { row.in += l.debit; row.out += l.credit; }
      if (l.account === BANK && e.refType === "opening") openingCash += l.debit - l.credit;
      const t = accountType(l.account);
      if (t === "income") row.income += l.credit - l.debit;
      if (t === "expense") row.expense += l.debit - l.credit;
    }
  }
  openingCash = round2(openingCash);
  let running = openingCash;
  const months = fy.months.map((m) => {
    const r = byMonth.get(m)!;
    if (m <= today.slice(0, 7)) running = round2(running + r.in - r.out);
    return { month: m, in: round2(r.in), out: round2(r.out), balance: running };
  });
  const incoming = round2(months.reduce((a, m) => a + m.in, 0));
  const outgoing = round2(months.reduce((a, m) => a + m.out, 0));
  const pnl = await profitAndLoss(s.orgId, fy.start, fy.end, entries);

  const invoices = (await listInvoices(s.orgId)).filter((i) => i.status === "sent").map((i) => ({ balance: invoiceBalance(i), dueDate: i.dueDate }));
  const openBills = (await listBills(s.orgId)).filter((x) => x.status === "approved").map((x) => ({ balance: billBalance(x), dueDate: x.dueDate }));

  return {
    limited: false,
    receivablesSplit: split(invoices, today), payablesSplit: split(openBills, today),
    fiscal: { start: fy.start, end: fy.end, openingCash, incoming, outgoing, closingCash: round2(openingCash + incoming - outgoing), months },
    incomeExpense: fy.months.map((m) => ({ month: m, income: round2(byMonth.get(m)!.income), expense: round2(byMonth.get(m)!.expense) })),
    topExpenses: [...pnl.expenses].sort((a, x) => x.amount - a.amount).slice(0, 5).map((r) => ({ name: r.name, amount: r.amount })),
    cashBalance: round2(cash), monthlyBurn: burn, runwayMonths: burn > 0 ? round2(cash / burn) : null,
    gstPayable: gst.netPayable, receivables: round2(b.get(AR) ?? 0), payables: round2(-(b.get(AP) ?? 0)), cashFlow, inbox, recent,
  };
}

export { SYSTEM };
