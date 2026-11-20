import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { orgPatchSchema } from "@/lib/server/schemas";
import { audit, getOrg } from "@/lib/server/services";
import { getStore } from "@/lib/server/store";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req);
  return ok(await getOrg(s.orgId));
});

export const PATCH = handle(async (req: Request) => {
  const s = await requireSession(req, "org:manage");
  const patch = orgPatchSchema.parse(await req.json());
  const org = await getOrg(s.orgId);
  const next = { ...org, ...patch, ...(patch.gstin ? { stateCode: patch.gstin.slice(0, 2) } : {}) };
  await getStore().saveOrg(next);
  await audit(s, "org.updated", org.name, Object.keys(patch).join(", "));
  return ok(next);
});
