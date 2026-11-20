// Shared domain types used by both the API (server) and the UI (client).

export type Role = "admin" | "finance" | "approver" | "employee" | "accountant";

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Full access, final approver for large bills, manages team" },
  { value: "finance", label: "Finance", description: "Records transactions, bills, invoices and payments" },
  { value: "approver", label: "Approver", description: "Approves bills up to the org threshold" },
  { value: "employee", label: "Employee", description: "Submits expenses and uploads receipts" },
  { value: "accountant", label: "Accountant (CA)", description: "Read-only access to books and reports, can export" },
];

export interface Org {
  id: string;
  name: string;
  gstin: string;
  stateCode: string; // first two digits of GSTIN, e.g. "29" = Karnataka
  address: string;
  approvalThreshold: number; // bills at or above this need a second (admin) approval
  /** Prefix for invoice numbers. `{FY}` is replaced with the financial year, e.g. "INV/{FY}/" → "INV/26-27/". */
  invoicePrefix: string;
  /** Legacy single counter, kept for display; real numbering uses per-financial-year sequences. */
  nextInvoiceNumber: number;
  sequences?: Record<string, number>;
  createdAt: string;
}

export interface Member {
  id: string; // = auth uid
  orgId: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Party {
  id: string;
  type: "vendor" | "customer";
  name: string;
  gstin?: string;
  stateCode: string;
  email?: string;
  phone?: string;
  pan?: string;
  createdAt: string;
}

export interface Item {
  id: string;
  name: string;
  hsn?: string;
  rate: number;
  gstRate: number;
  kind: "goods" | "service";
  createdAt: string;
}

export type TxnDirection = "in" | "out";
export type TxnSource = "bank" | "card" | "claim";

export const PAYMENT_MODES = ["Bank transfer (NEFT/RTGS/IMPS)", "UPI", "Cheque", "Cash", "Card"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  partyName?: string;
  amount: number; // always positive, direction gives the sign
  direction: TxnDirection;
  account: string; // ledger account code for the other side (expense or income)
  source: TxnSource;
  receipt: boolean;
  receiptName?: string;
  receiptPath?: string;
  notes?: string;
  status: "posted" | "pending_review";
  /** Employee claims: approved claims are owed to the employee until reimbursed. */
  reimbursedAt?: string;
  linkedType?: "bill" | "invoice" | "reimbursement";
  linkedId?: string;
  paymentMode?: PaymentMode;
  reference?: string;
  /** Set when matched to a line from an imported bank statement. */
  bankLineId?: string;
  createdBy: string;
  createdAt: string;
}

export interface LineItem {
  description: string;
  hsn?: string;
  qty: number;
  rate: number;
  gstRate: number; // 0, 5, 12, 18, 28
}

export interface TaxBreakup {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface Approval {
  by: string;
  byName: string;
  role: Role;
  at: string;
  decision: "approved" | "rejected";
  comment?: string;
}

export type BillStatus = "pending_approval" | "approved" | "rejected" | "paid";

export interface Bill extends TaxBreakup {
  id: string;
  vendorId: string;
  vendorName: string;
  /** Input GST is only claimable when the vendor is GST-registered. */
  vendorGstin?: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  account: string; // expense account
  items: LineItem[];
  status: BillStatus;
  approvalsRequired: number;
  approvals: Approval[];
  amountPaid: number;
  paidAt?: string;
  createdBy: string;
  createdAt: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export interface Invoice extends TaxBreakup {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerGstin?: string;
  placeOfSupply: string; // state code
  issueDate: string;
  dueDate: string;
  items: LineItem[];
  notes?: string;
  status: InvoiceStatus;
  amountPaid: number;
  amountCredited: number;
  paymentLink?: string;
  paymentLinkId?: string;
  paidAt?: string;
  recurringId?: string;
  createdBy: string;
  createdAt: string;
}

export interface CreditNote extends TaxBreakup {
  id: string;
  number: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  reason: string;
  items: LineItem[];
  createdBy: string;
  createdAt: string;
}

export interface RecurringProfile {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  items: LineItem[];
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  paymentTermsDays: number;
  nextDate: string;
  endDate?: string;
  autoSend: boolean;
  active: boolean;
  lastInvoiceId?: string;
  createdBy: string;
  createdAt: string;
}

export interface BankLine {
  id: string;
  date: string;
  description: string;
  amount: number; // positive
  direction: TxnDirection;
  reference?: string;
  importId: string;
  matchedTxnId?: string;
  createdAt: string;
}

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  memo: string;
  refType: "transaction" | "bill" | "bill_payment" | "invoice" | "invoice_payment" | "credit_note" | "reimbursement" | "opening";
  refId: string;
  lines: JournalLine[];
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  actorName: string;
  action: string;
  target: string;
  detail?: string;
}

export interface InboxItem {
  kind: "bill_approval" | "missing_receipt" | "overdue_invoice" | "bill_due" | "compliance" | "reimbursement" | "reconcile";
  title: string;
  detail: string;
  href: string;
  amount?: number;
  dueDate?: string;
  severity: "high" | "medium" | "low";
}

export interface AgeSplit { total: number; current: number; overdue: number }

export interface PaymentRow {
  id: string;
  number: string;
  date: string;
  partyName: string;
  refType: "invoice" | "bill";
  refId: string;
  refNumber: string;
  mode: string;
  reference?: string;
  amount: number;
}

export interface DashboardData {
  receivablesSplit: AgeSplit;
  payablesSplit: AgeSplit;
  fiscal: { start: string; end: string; openingCash: number; incoming: number; outgoing: number; closingCash: number; months: { month: string; in: number; out: number; balance: number }[] };
  incomeExpense: { month: string; income: number; expense: number }[];
  topExpenses: { name: string; amount: number }[];
  cashBalance: number;
  monthlyBurn: number;
  runwayMonths: number | null;
  gstPayable: number;
  receivables: number;
  payables: number;
  cashFlow: { month: string; in: number; out: number }[];
  inbox: InboxItem[];
  recent: Transaction[];
}

export interface SearchHit {
  kind: "invoice" | "bill" | "customer" | "vendor" | "transaction" | "credit_note";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  amount?: number;
}

export interface SessionUser {
  uid: string;
  name: string;
  email: string;
  role: Role;
  orgId: string;
}

/** Balance still owed on an invoice after payments and credit notes. */
export const invoiceBalance = (i: Pick<Invoice, "total" | "amountPaid" | "amountCredited" | "status">) =>
  i.status === "void" || i.status === "paid" ? 0 : Math.max(0, Math.round((i.total - (i.amountPaid ?? 0) - (i.amountCredited ?? 0)) * 100) / 100);

/** Balance still owed on a bill after payments. */
export const billBalance = (b: Pick<Bill, "total" | "amountPaid" | "status">) =>
  b.status === "paid" || b.status === "rejected" ? 0 : Math.max(0, Math.round((b.total - (b.amountPaid ?? 0)) * 100) / 100);
