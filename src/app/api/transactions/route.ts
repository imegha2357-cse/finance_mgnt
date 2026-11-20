import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { txnSchema } from "@/lib/server/schemas";
import { createTransaction, listTransactions } from "@/lib/server/services";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req);
  return ok(await listTransactions(s));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "txn:create");
  const input = txnSchema.parse(await req.json());
  // Employees can only submit out-of-pocket claims.
  if (s.role === "employee") Object.assign(input, { source: "claim", direction: "out", account: undefined });
  return ok(await createTransaction(s, input), 201);
});
