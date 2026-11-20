import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { reconciliation } from "@/lib/server/services";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req, "books:read");
  return ok(await reconciliation(s));
});
