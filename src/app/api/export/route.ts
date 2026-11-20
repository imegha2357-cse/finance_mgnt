import { requireSession } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { audit, getOrg } from "@/lib/server/services";
import { getStore, type Collection } from "@/lib/server/store";

const COLLECTIONS: Collection[] = ["parties", "items", "invoices", "credit_notes", "recurring", "bills", "transactions", "bank_lines", "journal", "members", "audit"];

/**
 * Everything the organisation has stored, as one JSON file. Supports the right to access / data portability
 * (DPDP Act 2023) and lets a business leave with its books at any time.
 */
export const GET = handle(async (req: Request) => {
  const s = await requireSession(req, "org:manage");
  const store = getStore();
  const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), org: await getOrg(s.orgId) };
  for (const col of COLLECTIONS) data[col] = await store.list(s.orgId, col);
  await audit(s, "data.exported", "all collections");
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="ledgerly-export-${new Date().toISOString().slice(0, 10)}.json"` },
  });
});
