import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { invoiceSchema } from "@/lib/server/schemas";
import { deleteInvoice, getInvoice, getOrg, listCreditNotes, listPayments, updateInvoice } from "@/lib/server/services";
import { getStore } from "@/lib/server/store";
import type { Party } from "@/lib/types";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "books:read");
  const { id } = await params;
  const invoice = await getInvoice(s.orgId, id);
  const [org, customer, creditNotes, payments] = await Promise.all([
    getOrg(s.orgId),
    getStore().get<Party>(s.orgId, "parties", invoice.customerId),
    listCreditNotes(s.orgId).then((c) => c.filter((x) => x.invoiceId === id)),
    listPayments(s.orgId, "received").then((p) => p.filter((x) => x.refId === id)),
  ]);
  return ok({ invoice, org, customer, creditNotes, payments });
});
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "invoice:create");
  return ok(await updateInvoice(s, (await params).id, invoiceSchema.parse(await req.json())));
});
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "invoice:create");
  await deleteInvoice(s, (await params).id);
  return ok({ ok: true });
});
