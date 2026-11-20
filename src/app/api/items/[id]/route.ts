import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { itemSchema } from "@/lib/server/schemas";
import { deleteItem, saveItem } from "@/lib/server/services";

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "party:write");
  return ok(await saveItem(s, itemSchema.parse(await req.json()), (await params).id));
});
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "party:write");
  await deleteItem(s, (await params).id);
  return ok({ ok: true });
});
