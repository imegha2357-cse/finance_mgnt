import { verifyCaller } from "@/lib/server/auth";
import { firebaseConfigured } from "@/lib/server/firebase-admin";
import { HttpError, handle, ok } from "@/lib/server/http";
import { bootstrapSchema } from "@/lib/server/schemas";
import { seedOrgData } from "@/lib/server/seed";
import { getStore, newId } from "@/lib/server/store";
import type { Member, Org } from "@/lib/types";

/** First sign-in with Firebase: creates the caller's organisation and makes them its admin. */
export const POST = handle(async (req: Request) => {
  if (!firebaseConfigured()) throw new HttpError(400, "Demo mode already has an organisation");
  const caller = await verifyCaller(req);
  const store = getStore();
  if (await store.getMember(caller.uid)) throw new HttpError(409, "You already belong to an organisation");
  const input = bootstrapSchema.parse(await req.json());
  const now = new Date().toISOString();
  const org: Org = {
    id: newId(), name: input.orgName, gstin: input.gstin, stateCode: input.gstin.slice(0, 2), address: input.address ?? "",
    approvalThreshold: 100000, invoicePrefix: "INV/{FY}/", sequences: {}, nextInvoiceNumber: 1, createdAt: now,
  };
  await store.saveOrg(org);
  const member: Member = { id: caller.uid, orgId: org.id, name: caller.name || caller.email, email: caller.email, role: "admin", createdAt: now };
  await store.saveMember(member);
  if (input.seedDemoData) await seedOrgData(org.id, { admin: caller.uid, finance: caller.uid });
  return ok({ org, member }, 201);
});
