import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { billSchema } from "@/lib/server/schemas";
import { approvalBlocker, createBill, listBills } from "@/lib/server/services";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req, "books:read");
  const bills = await listBills(s.orgId);
  return ok(bills.map((b) => ({ ...b, approvalBlocker: approvalBlocker(s, b) })));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "bill:create");
  return ok(await createBill(s, billSchema.parse(await req.json())), 201);
});
