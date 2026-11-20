import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { txnPatchSchema } from "@/lib/server/schemas";
import { deleteTransaction, updateTransaction } from "@/lib/server/services";

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req);
  return ok(await updateTransaction(s, (await params).id, txnPatchSchema.parse(await req.json())));
});
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req);
  await deleteTransaction(s, (await params).id);
  return ok({ ok: true });
});
