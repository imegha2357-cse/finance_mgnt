import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { HttpError, handle } from "@/lib/server/http";
import { gstr1 } from "@/lib/server/gstr1";
import { audit } from "@/lib/server/services";

/** GSTR-1 JSON for one month (?month=YYYY-MM), in the GST offline tool's layout. */
export const GET = handle(async (req: NextRequest) => {
  const s = await requireSession(req, "reports:read");
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "Pass month=YYYY-MM");
  const data = await gstr1(s.orgId, month);
  await audit(s, "report.exported", "gstr1", month);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="GSTR1_${data.gstin}_${data.fp}.json"` },
  });
});
