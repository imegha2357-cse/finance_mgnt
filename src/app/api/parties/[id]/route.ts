import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { partyPatchSchema } from "@/lib/server/schemas";
import { deleteParty, partyDetail, updateParty } from "@/lib/server/services";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "books:read");
  return ok(await partyDetail(s.orgId, (await params).id));
});
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "party:write");
  return ok(await updateParty(s, (await params).id, partyPatchSchema.parse(await req.json())));
});
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "party:write");
  await deleteParty(s, (await params).id);
  return ok({ ok: true });
});
