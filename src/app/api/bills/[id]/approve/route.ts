import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { decisionSchema } from "@/lib/server/schemas";
import { decideBill } from "@/lib/server/services";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "bill:approve");
  const { id } = await params;
  const { decision, comment } = decisionSchema.parse(await req.json());
  return ok(await decideBill(s, id, decision, comment));
});
