import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { invoiceSchema } from "@/lib/server/schemas";
import { createInvoice, listInvoices } from "@/lib/server/services";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req, "books:read");
  return ok(await listInvoices(s.orgId));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "invoice:create");
  return ok(await createInvoice(s, invoiceSchema.parse(await req.json())), 201);
});
