import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { dashboard } from "@/lib/server/services";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req);
  return ok(await dashboard(s));
});
