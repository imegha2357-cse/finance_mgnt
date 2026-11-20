import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { listPayments } from "@/lib/server/services";

/** GET /api/payments?kind=received|made — customer receipts or vendor payments. */
export const GET = handle(async (req: NextRequest) => {
  const s = await requireSession(req, "books:read");
  const kind = req.nextUrl.searchParams.get("kind") === "made" ? "made" : "received";
  return ok(await listPayments(s.orgId, kind));
});
