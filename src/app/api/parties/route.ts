import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { partySchema } from "@/lib/server/schemas";
import { createParty, listParties } from "@/lib/server/services";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req, "books:read");
  return ok(await listParties(s.orgId));
});

export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "party:write");
  return ok(await createParty(s, partySchema.parse(await req.json())), 201);
});
