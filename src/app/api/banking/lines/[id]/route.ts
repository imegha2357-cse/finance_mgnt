import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { HttpError } from "@/lib/server/http";
import { bankLineActionSchema } from "@/lib/server/schemas";
import { createFromBankLine, deleteBankLine, matchBankLine, unmatchBankLine } from "@/lib/server/services";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "txn:edit");
  const { id } = await params;
  const { action, txnId, account } = bankLineActionSchema.parse(await req.json());
  if (action === "match") {
    if (!txnId) throw new HttpError(400, "txnId is required");
    await matchBankLine(s, id, txnId);
  } else if (action === "unmatch") await unmatchBankLine(s, id);
  else if (action === "create") return ok(await createFromBankLine(s, id, account));
  else await deleteBankLine(s, id);
  return ok({ ok: true });
});
