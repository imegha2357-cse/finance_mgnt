import { requireSession } from "@/lib/server/auth";
import { adminAuth, firebaseConfigured } from "@/lib/server/firebase-admin";
import { HttpError, handle, ok } from "@/lib/server/http";
import { inviteSchema } from "@/lib/server/schemas";
import { audit } from "@/lib/server/services";
import { getStore, newId } from "@/lib/server/store";
import type { Member } from "@/lib/types";

export const GET = handle(async (req: Request) => {
  const s = await requireSession(req);
  const members = await getStore().list<Member>(s.orgId, "members");
  return ok(members.sort((a, b) => a.name.localeCompare(b.name)));
});

/** Adds a teammate. With Firebase, the account is created (or found) in Firebase Auth; they set a password via reset email. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession(req, "org:manage");
  const input = inviteSchema.parse(await req.json());
  let uid = `member-${newId()}`;
  let setupLink: string | undefined;
  if (firebaseConfigured()) {
    const auth = adminAuth();
    const user = await auth.getUserByEmail(input.email).catch(() => auth.createUser({ email: input.email, displayName: input.name }));
    uid = user.uid;
    // A one-time link the admin shares with the new teammate to set their password (no email service needed).
    setupLink = await auth.generatePasswordResetLink(input.email).catch(() => undefined);
  }
  const existing = await getStore().getMember(uid);
  if (existing) throw new HttpError(409, "This person already belongs to an organisation");
  const m: Member = { id: uid, orgId: s.orgId, name: input.name, email: input.email, role: input.role, createdAt: new Date().toISOString() };
  await getStore().saveMember(m);
  await audit(s, "member.added", input.email, input.role);
  return ok({ ...m, setupLink }, 201);
});
