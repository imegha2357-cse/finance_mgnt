import { HttpError, handle, ok } from "@/lib/server/http";
import { verifyWebhook } from "@/lib/server/razorpay";
import { SYSTEM, getInvoice, recordInvoicePayment, audit } from "@/lib/server/services";

/** Razorpay webhook: marks an invoice paid when its payment link is paid. Configure the "payment_link.paid" event. */
export const POST = handle(async (req: Request) => {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-razorpay-signature"))) throw new HttpError(401, "Bad signature");
  const evt = JSON.parse(raw) as { event: string; payload?: { payment_link?: { entity?: { notes?: { orgId?: string; invoiceId?: string }; amount_paid?: number } }; payment?: { entity?: { id?: string; method?: string } } } };
  if (evt.event !== "payment_link.paid") return ok({ ignored: evt.event });
  const link = evt.payload?.payment_link?.entity;
  const orgId = link?.notes?.orgId, invoiceId = link?.notes?.invoiceId;
  if (!orgId || !invoiceId) throw new HttpError(400, "Missing invoice reference");
  const inv = await getInvoice(orgId, invoiceId);
  if (inv.status !== "sent") return ok({ alreadyHandled: true });
  const amount = (link?.amount_paid ?? 0) / 100 || undefined;
  const s = SYSTEM(orgId);
  await recordInvoicePayment(s, invoiceId, { amount, mode: evt.payload?.payment?.entity?.method === "upi" ? "UPI" : "Card", reference: evt.payload?.payment?.entity?.id });
  await audit(s, "invoice.paid_online", inv.number, evt.payload?.payment?.entity?.id);
  return ok({ ok: true });
});
