import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { runRecurring } from "@/lib/server/services";

/** Creates any recurring invoices that are due now, for the caller's organisation. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "invoice:create");
  const created = await runRecurring(s.orgId);
  return ok({ created: created.length, invoices: created.map((i) => ({ id: i.id, number: i.number })) });
});
