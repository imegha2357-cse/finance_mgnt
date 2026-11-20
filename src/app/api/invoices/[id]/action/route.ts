import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { invoiceActionSchema } from "@/lib/server/schemas";
import { invoiceAction } from "@/lib/server/services";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "invoice:update");
  const { action } = invoiceActionSchema.parse(await req.json());
  return ok(await invoiceAction(s, (await params).id, action));
});
