import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { HttpError, handle } from "@/lib/server/http";
import { audit, ledgerExport, toCsv } from "@/lib/server/services";
import { reportCsv } from "@/lib/server/report-csv";
import { runReport } from "@/lib/server/reports";

/** CSV export. `type=journal` (default) is the full double-entry ledger, ready for Tally or Zoho Books; other types export that report. */
export const GET = handle(async (req: NextRequest) => {
  const s = await requireSession(req, "reports:read");
  const q = req.nextUrl.searchParams;
  const type = q.get("type") ?? "journal";
  let csv: string;
  if (type === "journal") csv = await ledgerExport(s.orgId);
  else {
    const data = await runReport(q, s.orgId);
    const rows = reportCsv(type, data);
    if (!rows) throw new HttpError(400, "This report cannot be exported");
    csv = toCsv(rows);
  }
  await audit(s, "report.exported", type);
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});
