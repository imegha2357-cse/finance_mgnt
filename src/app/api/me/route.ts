import { getSession } from "@/lib/server/auth";
import { firebaseConfigured } from "@/lib/server/firebase-admin";
import { handle, ok } from "@/lib/server/http";
import { getOrg } from "@/lib/server/services";
import { paymentLinksEnabled } from "@/lib/server/razorpay";

export const GET = handle(async (req: Request) => {
  const user = await getSession(req);
  const org = await getOrg(user.orgId);
  return ok({ user, org, mode: firebaseConfigured() ? "firebase" : "demo", features: { paymentLinks: paymentLinksEnabled() } });
});
