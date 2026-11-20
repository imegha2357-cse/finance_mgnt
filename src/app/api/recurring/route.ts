import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { recurringSchema } from "@/lib/server/schemas";
import { listRecurring, saveRecurring } from "@/lib/server/services";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req, "books:read");
  return ok(await listRecurring(s.orgId));
});
export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "invoice:create");
  return ok(await saveRecurring(s, recurringSchema.parse(await req.json())), 201);
});
