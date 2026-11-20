import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { paymentSchema } from "@/lib/server/schemas";
import { recordInvoicePayment } from "@/lib/server/services";

/** Records a full or partial customer payment. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "invoice:update");
  return ok(await recordInvoicePayment(s, (await params).id, paymentSchema.parse(await req.json())));
});
