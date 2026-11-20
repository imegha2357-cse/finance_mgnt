import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { recurringSchema } from "@/lib/server/schemas";
import { deleteRecurring, saveRecurring } from "@/lib/server/services";

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "invoice:create");
  return ok(await saveRecurring(s, recurringSchema.parse(await req.json()), (await params).id));
});
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "invoice:create");
  await deleteRecurring(s, (await params).id);
  return ok({ ok: true });
});
