import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { Invoice, Party } from "../types";

/**
 * Razorpay Payment Links. Enabled only when RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set;
 * otherwise invoices simply have no online payment link (no fake URLs).
 * Docs: https://razorpay.com/docs/api/payments/payment-links/
 */
export const paymentLinksEnabled = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

export async function createPaymentLink(orgId: string, inv: Invoice, customer: Party | null) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(inv.total * 100), // paise
      currency: "INR",
      accept_partial: false,
      reference_id: inv.number.slice(0, 40),
      description: `Invoice ${inv.number}`,
      expire_by: Math.floor(Date.parse(inv.dueDate + "T23:59:59+05:30") / 1000) + 30 * 86400,
      customer: { name: inv.customerName, email: customer?.email, contact: customer?.phone },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { orgId, invoiceId: inv.id },
    }),
  });
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { id: string; short_url: string };
  return { id: body.id, url: body.short_url };
}

/** Verifies the X-Razorpay-Signature header (HMAC-SHA256 of the raw body with the webhook secret). */
export function verifyWebhook(raw: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
