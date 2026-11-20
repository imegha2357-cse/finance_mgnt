import { HttpError, handle, ok } from "@/lib/server/http";
import { runRecurring } from "@/lib/server/services";
import { getStore } from "@/lib/server/store";

/** Daily job (see vercel.json): creates due recurring invoices for every organisation. Protected by CRON_SECRET. */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  let created = 0;
  for (const orgId of await getStore().listOrgIds()) created += (await runRecurring(orgId)).length;
  return ok({ created });
});
