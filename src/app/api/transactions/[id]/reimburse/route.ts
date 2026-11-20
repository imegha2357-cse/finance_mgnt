import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { paymentSchema } from "@/lib/server/schemas";
import { reimburseClaim } from "@/lib/server/services";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "txn:edit");
  const opts = paymentSchema.parse(await req.json().catch(() => ({})));
  return ok(await reimburseClaim(s, (await params).id, opts));
});
