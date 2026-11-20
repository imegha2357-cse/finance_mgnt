"use client";
import { StatusText } from "./ui";
import { daysBetween, today } from "@/lib/format";
import type { Bill, Invoice } from "@/lib/types";


export function InvoiceStatus({ inv }: { inv: Invoice }) {
  const t0 = today();
  const partial = inv.status === "sent" && ((inv.amountPaid ?? 0) > 0 || (inv.amountCredited ?? 0) > 0);
  if (partial && inv.dueDate < t0) return <StatusText tone="orange">Partially paid · overdue {daysBetween(inv.dueDate, t0)}d</StatusText>;
  if (partial) return <StatusText tone="blue">Partially paid</StatusText>;
  if (inv.status === "sent" && inv.dueDate < t0) return <StatusText tone="orange">Overdue by {daysBetween(inv.dueDate, t0)} days</StatusText>;
  if (inv.status === "sent") return inv.dueDate === t0 ? <StatusText tone="blue">Due today</StatusText> : <StatusText tone="blue">Due in {daysBetween(t0, inv.dueDate)} days</StatusText>;
  if (inv.status === "paid") return <StatusText tone="green">Paid</StatusText>;
  if (inv.status === "draft") return <StatusText tone="gray">Draft</StatusText>;
  return <StatusText tone="red">Void</StatusText>;
}

export function BillStatus({ bill }: { bill: Bill }) {
  const t0 = today();
  if (bill.status === "pending_approval") return <StatusText tone="orange">Pending approval {bill.approvalsRequired > 1 ? `(${bill.approvals.length}/${bill.approvalsRequired})` : ""}</StatusText>;
  if (bill.status === "approved" && (bill.amountPaid ?? 0) > 0) return <StatusText tone={bill.dueDate < t0 ? "red" : "blue"}>Partially paid</StatusText>;
  if (bill.status === "approved") return bill.dueDate < t0 ? <StatusText tone="red">Overdue by {daysBetween(bill.dueDate, t0)} days</StatusText> : <StatusText tone="blue">Open</StatusText>;
  if (bill.status === "paid") return <StatusText tone="green">Paid</StatusText>;
  return <StatusText tone="gray">Rejected</StatusText>;
}
