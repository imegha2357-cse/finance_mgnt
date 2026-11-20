import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { runReport } from "@/lib/server/reports";

export const GET = handle(async (req: NextRequest) => {
  const s = await requireSession(req, "reports:read");
  return ok(await runReport(req.nextUrl.searchParams, s.orgId));
});
