import "server-only";
import { z } from "zod";
import { isValidGstin } from "../gst";
import { PAYMENT_MODES } from "../types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const gstin = z.string().trim().toUpperCase().refine((v) => v === "" || isValidGstin(v), "Invalid GSTIN").optional();
const money = z.number().positive().max(1e10);

const partyFields = {
  name: z.string().trim().min(2, "Name is too short").max(120),
  gstin,
  stateCode: z.string().length(2).optional(),
  email: z.union([z.literal(""), z.email()]).optional(),
  phone: z.string().max(20).optional(),
  pan: z.string().trim().toUpperCase().refine((v) => v === "" || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), "Invalid PAN").optional(),
};
export const partySchema = z.object({ type: z.enum(["vendor", "customer"]), ...partyFields });
export const partyPatchSchema = z.object(partyFields);

export const itemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  hsn: z.string().max(10).optional(),
  rate: z.number().nonnegative().max(1e10),
  gstRate: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]),
  kind: z.enum(["goods", "service"]),
});

export const txnSchema = z.object({
  date,
  description: z.string().trim().min(2).max(200),
  partyName: z.string().max(120).optional(),
  amount: money,
  direction: z.enum(["in", "out"]),
  account: z.string().optional(),
  source: z.enum(["bank", "card", "claim"]),
  receipt: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export const txnPatchSchema = z.object({
  description: z.string().trim().min(2).max(200).optional(),
  amount: money.optional(),
  date: date.optional(),
  partyName: z.string().max(120).optional(),
  account: z.string().optional(),
  receipt: z.boolean().optional(),
  notes: z.string().max(500).optional(),
  status: z.literal("posted").optional(),
});

const lineItem = z.object({
  description: z.string().trim().min(1).max(200),
  hsn: z.string().max(10).optional(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  gstRate: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]),
});

export const billSchema = z.object({
  vendorId: z.string().min(1, "Choose a vendor"),
  billNumber: z.string().trim().min(1).max(50),
  billDate: date,
  dueDate: date,
  account: z.string(),
  items: z.array(lineItem).min(1),
}).refine((b) => b.dueDate >= b.billDate, { message: "Due date is before the bill date", path: ["dueDate"] });

export const decisionSchema = z.object({ decision: z.enum(["approved", "rejected"]), comment: z.string().max(500).optional() });

const mode = z.enum(PAYMENT_MODES).optional();
export const paymentSchema = z.object({ date: date.optional(), mode, reference: z.string().max(60).optional(), amount: money.optional() });

export const invoiceSchema = z.object({
  customerId: z.string().min(1, "Choose a customer"),
  issueDate: date,
  dueDate: date,
  placeOfSupply: z.string().length(2).optional(),
  items: z.array(lineItem).min(1),
  notes: z.string().max(1000).optional(),
  send: z.boolean(),
}).refine((b) => b.dueDate >= b.issueDate, { message: "Due date is before the issue date", path: ["dueDate"] });

export const invoiceActionSchema = z.object({ action: z.enum(["send", "void"]) });

export const creditNoteSchema = z.object({
  invoiceId: z.string().min(1),
  date,
  reason: z.string().trim().min(3).max(300),
  items: z.array(lineItem).min(1),
});

export const recurringSchema = z.object({
  name: z.string().trim().min(2).max(120),
  customerId: z.string().min(1),
  items: z.array(lineItem).min(1),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  paymentTermsDays: z.number().int().min(0).max(180),
  nextDate: date,
  endDate: z.union([z.literal(""), date]).optional(),
  autoSend: z.boolean(),
  active: z.boolean(),
});

export const bankImportSchema = z.object({ csv: z.string().min(10).max(2_000_000) });
export const bankLineActionSchema = z.object({
  action: z.enum(["match", "unmatch", "create", "delete"]),
  txnId: z.string().optional(),
  account: z.string().optional(),
});

export const orgPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  gstin: z.string().trim().toUpperCase().refine(isValidGstin, "Invalid GSTIN").optional(),
  address: z.string().max(300).optional(),
  approvalThreshold: z.number().nonnegative().optional(),
  invoicePrefix: z.string().max(20).optional(),
});

export const bootstrapSchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  gstin: z.string().trim().toUpperCase().refine(isValidGstin, "Invalid GSTIN"),
  address: z.string().max(300).optional(),
  seedDemoData: z.boolean().optional(),
});

export const inviteSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(2).max(80),
  role: z.enum(["admin", "finance", "approver", "employee", "accountant"]),
});

export const rolePatchSchema = z.object({ role: z.enum(["admin", "finance", "approver", "employee", "accountant"]) });
