import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { bankImportSchema } from "@/lib/server/schemas";
import { importBankStatement } from "@/lib/server/services";

/** Imports a bank statement CSV (duplicates are skipped). */
export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "txn:edit");
  return ok(await importBankStatement(s, bankImportSchema.parse(await req.json()).csv), 201);
});
