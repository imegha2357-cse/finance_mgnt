import "server-only";
import { adminAuth, firebaseConfigProblem, firebaseConfigured } from "./firebase-admin";
import { getStore } from "./store";
import { HttpError } from "./http";
import { ensureDemoOrg, DEMO_ORG_ID } from "./seed";
import { can, type Action } from "../permissions";
import type { Role, SessionUser } from "../types";

const DEMO_ROLES: Role[] = ["admin", "finance", "approver", "employee", "accountant"];

/** Verifies the caller. Production: Firebase ID token in `Authorization: Bearer`. Demo: `x-demo-role` header. */
export async function verifyCaller(req: Request): Promise<{ uid: string; email: string; name: string }> {
  const problem = firebaseConfigProblem();
  if (problem) throw new HttpError(503, `Server misconfigured: ${problem}. Fix the environment variables and redeploy.`, "config");
  if (!firebaseConfigured()) {
    const role = (req.headers.get("x-demo-role") ?? "admin") as Role;
    if (!DEMO_ROLES.includes(role)) throw new HttpError(401, "Unknown demo role");
    await ensureDemoOrg();
    return { uid: `demo-${role}`, email: `${role}@demo.ledgerly.in`, name: "" };
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Sign in required", "unauthenticated");
  try {
    const d = await (await adminAuth()).verifyIdToken(token);
    return { uid: d.uid, email: d.email ?? "", name: (d.name as string) ?? d.email ?? "User" };
  } catch {
    throw new HttpError(401, "Session expired, please sign in again", "unauthenticated");
  }
}

export async function getSession(req: Request): Promise<SessionUser> {
  const caller = await verifyCaller(req);
  const member = await getStore().getMember(caller.uid);
  if (!member) throw new HttpError(403, "No organisation set up for this account yet", "no_org");
  return { uid: member.id, name: member.name, email: member.email, role: member.role, orgId: member.orgId };
}

export async function requireSession(req: Request, action?: Action): Promise<SessionUser> {
  const s = await getSession(req);
  if (action && !can(s.role, action)) throw new HttpError(403, `Your role (${s.role}) cannot do this`, "forbidden");
  return s;
}

export { DEMO_ORG_ID };
