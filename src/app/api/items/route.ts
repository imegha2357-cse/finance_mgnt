import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { itemSchema } from "@/lib/server/schemas";
import { listItems, saveItem } from "@/lib/server/services";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req, "books:read");
  return ok(await listItems(s.orgId));
});
export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "party:write");
  return ok(await saveItem(s, itemSchema.parse(await req.json())), 201);
});
