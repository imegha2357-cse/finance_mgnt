import "server-only";
import { HttpError } from "./http";
import { ageing, balanceSheet, cashFlowByMonth, generalLedger, gstSummary, profitAndLoss, trialBalance } from "./services";
import { fiscalYear, today } from "../format";

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function runReport(q: URLSearchParams, orgId: string) {
  const t = today();
  const fy = fiscalYear(t);
  const from = isDate(q.get("from")) ? q.get("from")! : fy.start;
  const to = isDate(q.get("to")) ? q.get("to")! : t;
  const asOf = isDate(q.get("asOf")) ? q.get("asOf")! : t;
  switch (q.get("type")) {
    case "pnl": return profitAndLoss(orgId, from, to);
    case "balance-sheet": return balanceSheet(orgId, asOf);
    case "trial-balance": return trialBalance(orgId, asOf);
    case "ledger": return generalLedger(orgId, q.get("account") ?? "1000", from, to);
    case "ageing": return ageing(orgId, q.get("kind") === "payables" ? "payables" : "receivables", asOf);
    case "cashflow": return cashFlowByMonth(orgId, Math.min(24, Math.max(1, Number(q.get("months")) || 12)));
    case "gst": return gstSummary(orgId, /^\d{4}-\d{2}$/.test(q.get("month") ?? "") ? q.get("month")! : t.slice(0, 7));
    default: throw new HttpError(400, "type must be pnl, balance-sheet, trial-balance, ledger, ageing, cashflow or gst");
  }
}

