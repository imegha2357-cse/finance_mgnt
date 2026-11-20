import "server-only";

type Row = (string | number)[];
const f = (n: number) => (n ? n.toFixed(2) : "0.00");

/** Turns a report payload into CSV rows. Returns null for unknown types. */
export function reportCsv(type: string, data: unknown): Row[] | null {
  const d = data as Record<string, unknown>;
  switch (type) {
    case "pnl": {
      const p = d as { income: { name: string; amount: number }[]; expenses: { name: string; amount: number }[]; totalIncome: number; totalExpenses: number; netProfit: number; from: string; to: string };
      return [["Profit and loss", `${p.from} to ${p.to}`], [], ["Income", ""], ...p.income.map((r) => [r.name, f(r.amount)]), ["Total income", f(p.totalIncome)], [], ["Expenses", ""], ...p.expenses.map((r) => [r.name, f(r.amount)]), ["Total expenses", f(p.totalExpenses)], [], ["Net profit", f(p.netProfit)]];
    }
    case "balance-sheet": {
      const b = d as { asOf: string; assets: { name: string; amount: number }[]; liabilities: { name: string; amount: number }[]; equity: { name: string; amount: number }[]; totalAssets: number; totalLiabilities: number; totalEquity: number };
      return [["Balance sheet as of", b.asOf], [], ["Assets", ""], ...b.assets.map((r) => [r.name, f(r.amount)]), ["Total assets", f(b.totalAssets)], [], ["Liabilities", ""], ...b.liabilities.map((r) => [r.name, f(r.amount)]), ["Total liabilities", f(b.totalLiabilities)], [], ["Equity", ""], ...b.equity.map((r) => [r.name, f(r.amount)]), ["Total equity", f(b.totalEquity)]];
    }
    case "trial-balance": {
      const t = d as { asOf: string; rows: { code: string; name: string; debit: number; credit: number }[]; totalDebit: number; totalCredit: number };
      return [["Code", "Account", "Debit", "Credit"], ...t.rows.map((r) => [r.code, r.name, f(r.debit), f(r.credit)]), ["", "Total", f(t.totalDebit), f(t.totalCredit)]];
    }
    case "ledger": {
      const l = d as { name: string; opening: number; closing: number; rows: { date: string; voucher: string; memo: string; debit: number; credit: number; balance: number }[] };
      return [["Account", l.name], ["Date", "Voucher", "Memo", "Debit", "Credit", "Balance"], ["", "", "Opening balance", "", "", f(l.opening)], ...l.rows.map((r) => [r.date, r.voucher, r.memo, f(r.debit), f(r.credit), f(r.balance)]), ["", "", "Closing balance", "", "", f(l.closing)]];
    }
    case "ageing": {
      const a = d as { kind: string; rows: Record<string, string | number>[]; totals: Record<string, number> };
      const cols = ["current", "1-30", "31-60", "61-90", "90+", "total"];
      return [[a.kind === "payables" ? "Vendor" : "Customer", "Current", "1-30 days", "31-60 days", "61-90 days", "90+ days", "Total"], ...a.rows.map((r) => [String(r.party), ...cols.map((c) => f(Number(r[c])))]), ["Total", ...cols.map((c) => f(a.totals[c]))]];
    }
    case "gst": {
      const g = d as { month: string; outputTax: number; inputTaxCredit: number; netPayable: number; b2b: Record<string, number>; b2c: Record<string, number>; creditNotes: Record<string, number>; purchases: Record<string, number> };
      const r = (label: string, x: Record<string, number>) => [label, f(x.taxable), f(x.cgst), f(x.sgst), f(x.igst)];
      return [["GST summary", g.month], ["Section", "Taxable value", "CGST", "SGST", "IGST"], r("B2B invoices", g.b2b), r("B2C invoices", g.b2c), r("Credit notes", g.creditNotes), r("Purchases (ITC)", g.purchases), [], ["Output tax", f(g.outputTax)], ["Input tax credit", f(g.inputTaxCredit)], ["Net payable", f(g.netPayable)]];
    }
    default:
      return null;
  }
}
