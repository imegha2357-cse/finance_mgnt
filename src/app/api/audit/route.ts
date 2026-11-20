import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import type { AuditEvent } from "@/lib/types";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req, "books:read");
  const events = await getStore().list<AuditEvent>(s.orgId, "audit");
  return ok(events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200));
});
