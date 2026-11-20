import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { creditNoteSchema } from "@/lib/server/schemas";
import { createCreditNote, listCreditNotes } from "@/lib/server/services";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req, "books:read");
  return ok(await listCreditNotes(s.orgId));
});
export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "invoice:update");
  return ok(await createCreditNote(s, creditNoteSchema.parse(await req.json())), 201);
});
