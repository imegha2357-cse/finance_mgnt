import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { paymentSchema } from "@/lib/server/schemas";
import { payBill } from "@/lib/server/services";

/** Records a full or partial payment. Moving the money itself needs a payout integration. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "bill:pay");
  const opts = paymentSchema.parse(await req.json().catch(() => ({})));
  return ok(await payBill(s, (await params).id, opts));
});
