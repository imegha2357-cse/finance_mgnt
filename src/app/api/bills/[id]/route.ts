import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { HttpError } from "@/lib/server/http";
import { billSchema } from "@/lib/server/schemas";
import { approvalBlocker, deleteBill, listBills, updateBill } from "@/lib/server/services";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "books:read");
  const id = (await params).id;
  const b = (await listBills(s.orgId)).find((x) => x.id === id);
  if (!b) throw new HttpError(404, "Bill not found");
  return ok({ ...b, approvalBlocker: approvalBlocker(s, b) });
});
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "bill:create");
  return ok(await updateBill(s, (await params).id, billSchema.parse(await req.json())));
});
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "bill:create");
  await deleteBill(s, (await params).id);
  return ok({ ok: true });
});
