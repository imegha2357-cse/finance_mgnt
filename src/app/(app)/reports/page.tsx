"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { useAuth, useData } from "@/components/auth-provider";
import { CashChart } from "@/components/cash-chart";
import { Guard } from "@/components/guard";
import { Button, ErrorNote, Field, Input, Loading, PageHeader, Select, Tabs, Td, Th, downloadText } from "@/components/ui";
import { ACCOUNTS } from "@/lib/accounts";
import { addMonths, fiscalYear, fmtDate, money, today } from "@/lib/format";

const dayBefore = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
/** Quick periods an Indian accountant reaches for (FY runs April–March). */
const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: "This month", range: () => [today().slice(0, 8) + "01", today()] },
  { label: "Last month", range: () => { const first = today().slice(0, 8) + "01"; return [addMonths(first, -1), dayBefore(first)]; } },
  { label: "This quarter", range: () => { const m = Number(today().slice(5, 7)); const qStart = [4, 7, 10, 1][Math.floor(((m + 8) % 12) / 3)]; const y = Number(today().slice(0, 4)); return [`${y}-${String(qStart).padStart(2, "0")}-01`, today()]; } },
  { label: "This financial year", range: () => [fiscalYear().start, today()] },
  { label: "Last financial year", range: () => { const f = fiscalYear(); return [addMonths(f.start, -12), dayBefore(f.start)]; } },
];

type Row = { code: string; name: string; amount: number };
type Pnl = { from: string; to: string; income: Row[]; expenses: Row[]; totalIncome: number; totalExpenses: number; netProfit: number };
type Bs = { asOf: string; assets: Row[]; liabilities: Row[]; equity: Row[]; totalAssets: number; totalLiabilities: number; totalEquity: number };
type Tb = { asOf: string; rows: { code: string; name: string; type: string; debit: number; credit: number }[]; totalDebit: number; totalCredit: number };
type Gl = { name: string; opening: number; closing: number; rows: { date: string; memo: string; voucher: string; debit: number; credit: number; balance: number }[] };
type Ageing = { kind: string; asOf: string; rows: ({ party: string; partyId: string } & Record<string, number>)[]; totals: Record<string, number> };
type Sec = { taxable: number; cgst: number; sgst: number; igst: number };
type Gst = { month: string; outputTax: number; inputTaxCredit: number; netPayable: number; b2b: Sec; b2c: Sec; creditNotes: Sec; purchases: Sec; b2bCount: number; b2cCount: number; creditNoteCount: number; billCount: number };
type Flow = { month: string; in: number; out: number }[];

type Tab = "pnl" | "bs" | "tb" | "gl" | "ar" | "ap" | "cashflow" | "gst";
const EXPORT_TYPE: Partial<Record<Tab, string>> = { pnl: "pnl", bs: "balance-sheet", tb: "trial-balance", gl: "ledger", ar: "ageing", ap: "ageing", gst: "gst" };

function Section({ title, rows, total, totalLabel }: { title: string; rows: Row[]; total: number; totalLabel: string }) {
  return (
    <>
      <tr className="bg-canvas"><td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</td></tr>
      {rows.map((r) => <tr key={r.code}><Td className="pl-8">{r.name}</Td><Td right>{money(r.amount)}</Td></tr>)}
      <tr className="border-t border-line font-medium"><Td>{totalLabel}</Td><Td right>{money(total)}</Td></tr>
    </>
  );
}

const box = "max-w-3xl overflow-hidden rounded-lg border border-line";

export default function ReportsPage() {
  const { api } = useAuth();
  const params = useSearchParams();
  const fy = fiscalYear();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "pnl");
  const [from, setFrom] = useState(fy.start);
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [account, setAccount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const query: Record<Tab, string> = {
    pnl: `type=pnl&from=${from}&to=${to}`, bs: `type=balance-sheet&asOf=${asOf}`, tb: `type=trial-balance&asOf=${asOf}`,
    gl: `type=ledger&account=${account}&from=${from}&to=${to}`, ar: `type=ageing&kind=receivables&asOf=${asOf}`, ap: `type=ageing&kind=payables&asOf=${asOf}`,
    cashflow: "type=cashflow&months=12", gst: `type=gst&month=${month}`,
  };
  const { data, error } = useData<unknown>(`/api/reports?${query[tab]}`);

  const exportCsv = async (type?: string) => {
    setBusy(true); setErr(null);
    try {
      const q = type ? `?type=${type}&${query[tab].replace(/^type=[^&]+&?/, "")}` : "";
      downloadText(await api<string>(`/api/reports/export${q}`), `${type ?? "journal"}-${today()}.csv`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const downloadGstr1 = async () => {
    setBusy(true); setErr(null);
    try { downloadText(await api<string>(`/api/reports/gstr1?month=${month}`, { headers: { accept: "application/json" } }).then((d) => (typeof d === "string" ? d : JSON.stringify(d, null, 2))), `GSTR1_${month}.json`); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const showRange = tab === "pnl" || tab === "gl";
  const showAsOf = tab === "bs" || tab === "tb" || tab === "ar" || tab === "ap";

  return (
    <Guard need="reports:read">
      <div className="px-6 py-5">
        <PageHeader title="Reports" subtitle="Live from the double-entry ledger"
          actions={<>
            <Button onClick={() => window.print()}><Printer className="size-4" />Print / PDF</Button>
            {EXPORT_TYPE[tab] && <Button loading={busy} onClick={() => exportCsv(EXPORT_TYPE[tab])}><Download className="size-4" />Export this report</Button>}
            <Button loading={busy} onClick={() => exportCsv()}><Download className="size-4" />Journal for Tally / Zoho</Button>
          </>} />
        <div className="no-print">
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: "pnl", label: "Profit & loss" }, { value: "bs", label: "Balance sheet" }, { value: "tb", label: "Trial balance" }, { value: "gl", label: "Ledger" },
            { value: "ar", label: "To receive (ageing)" }, { value: "ap", label: "To pay (ageing)" }, { value: "cashflow", label: "Cash flow" }, { value: "gst", label: "GST" },
          ]} />
          <div className="mb-4 flex flex-wrap gap-3">
            {tab === "gl" && <Field label="Account" className="w-64"><Select value={account} onChange={(e) => setAccount(e.target.value)}>{ACCOUNTS.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</Select></Field>}
            {showRange && <>
              <Field label="Period"><Select aria-label="Quick period" value="" onChange={(e) => { const p = PRESETS.find((x) => x.label === e.target.value)?.range(); if (p) { setFrom(p[0]); setTo(p[1]); } }} className="w-44!">
                <option value="">Choose…</option>{PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}
              </Select></Field>
              <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </>}
            {showAsOf && <Field label="As of" className="w-48"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>}
            {tab === "gst" && <>
              <Field label="Tax period" className="w-48"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
              <div className="flex items-end"><Button loading={busy} onClick={downloadGstr1}><Download className="size-4" />GSTR-1 JSON for the GST portal</Button></div>
            </>}
          </div>
        </div>
        <ErrorNote message={error ?? err} />
        {!data ? <Loading /> : (
          <>
            {tab === "pnl" && (() => { const d = data as Pnl; return (
              <div className={box}><table className="w-full"><tbody className="divide-y divide-line">
                <Section title="Income" rows={d.income} total={d.totalIncome} totalLabel="Total income" />
                <Section title="Expenses" rows={d.expenses} total={d.totalExpenses} totalLabel="Total expenses" />
                <tr className="bg-accent-soft text-base font-semibold"><Td>Net {d.netProfit >= 0 ? "profit" : "loss"}</Td><Td right className={d.netProfit >= 0 ? "text-in" : "text-out"}>{money(d.netProfit)}</Td></tr>
              </tbody></table></div>); })()}
            {tab === "bs" && (() => { const d = data as Bs; return (
              <div className={box}><table className="w-full"><tbody className="divide-y divide-line">
                <Section title="Assets" rows={d.assets} total={d.totalAssets} totalLabel="Total assets" />
                <Section title="Liabilities" rows={d.liabilities} total={d.totalLiabilities} totalLabel="Total liabilities" />
                <Section title="Equity" rows={d.equity} total={d.totalEquity} totalLabel="Total equity" />
                <tr className="bg-accent-soft font-semibold"><Td>Liabilities + equity</Td><Td right>{money(d.totalLiabilities + d.totalEquity)}</Td></tr>
              </tbody></table></div>); })()}
            {tab === "tb" && (() => { const d = data as Tb; return (
              <div className={box}><table className="w-full">
                <thead className="border-b border-line"><tr><Th>Account</Th><Th right>Debit</Th><Th right>Credit</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {d.rows.map((r) => <tr key={r.code}><Td><span className="mr-2 text-muted">{r.code}</span>{r.name}</Td><Td right>{r.debit ? money(r.debit) : ""}</Td><Td right>{r.credit ? money(r.credit) : ""}</Td></tr>)}
                  <tr className="bg-accent-soft font-semibold"><Td>Total {Math.abs(d.totalDebit - d.totalCredit) < 0.01 ? "· balanced" : "· NOT balanced"}</Td><Td right>{money(d.totalDebit)}</Td><Td right>{money(d.totalCredit)}</Td></tr>
                </tbody>
              </table></div>); })()}
            {tab === "gl" && (() => { const d = data as Gl; return (
              <div className="overflow-hidden rounded-lg border border-line"><table className="w-full">
                <thead className="border-b border-line"><tr><Th>Date</Th><Th>Description</Th><Th right>Debit</Th><Th right>Credit</Th><Th right>Balance</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  <tr className="bg-canvas"><Td /><Td className="font-medium">Opening balance</Td><Td /><Td /><Td right className="font-medium">{money(d.opening)}</Td></tr>
                  {d.rows.map((r, k) => <tr key={k}><Td className="whitespace-nowrap">{fmtDate(r.date)}</Td><Td>{r.memo}</Td><Td right>{r.debit ? money(r.debit) : ""}</Td><Td right>{r.credit ? money(r.credit) : ""}</Td><Td right>{money(r.balance)}</Td></tr>)}
                  <tr className="bg-accent-soft font-semibold"><Td /><Td>Closing balance</Td><Td /><Td /><Td right>{money(d.closing)}</Td></tr>
                </tbody>
              </table><p className="px-4 py-2 text-xs text-muted">Balance shown as debit minus credit. For liability, income and equity accounts a negative figure is a normal credit balance.</p></div>); })()}
            {(tab === "ar" || tab === "ap") && (() => { const d = data as Ageing; const cols = ["current", "1-30", "31-60", "61-90", "90+", "total"]; return (
              <div className="overflow-hidden rounded-lg border border-line"><table className="w-full">
                <thead className="border-b border-line"><tr><Th>{tab === "ar" ? "Customer" : "Vendor"}</Th><Th right>Current</Th><Th right>1–30 days</Th><Th right>31–60 days</Th><Th right>61–90 days</Th><Th right>90+ days</Th><Th right>Total</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {d.rows.map((r) => <tr key={r.partyId}><Td><Link href={`/${tab === "ar" ? "customers" : "vendors"}/${r.partyId}`} className="text-accent">{r.party}</Link></Td>{cols.map((c) => <Td key={c} right className={c === "total" ? "font-medium" : c !== "current" && r[c] > 0 ? "text-warn" : ""}>{money(r[c])}</Td>)}</tr>)}
                  {!d.rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">Nothing outstanding</td></tr>}
                  <tr className="bg-accent-soft font-semibold"><Td>Total</Td>{cols.map((c) => <Td key={c} right>{money(d.totals[c])}</Td>)}</tr>
                </tbody>
              </table></div>); })()}
            {tab === "cashflow" && (() => { const d = data as Flow; return (
              <div className="space-y-4">
                <div className="rounded-lg border border-line p-4"><CashChart data={d} height={300} /></div>
                <div className="overflow-hidden rounded-lg border border-line"><table className="w-full">
                  <thead className="border-b border-line"><tr><Th>Month</Th><Th right>Money in</Th><Th right>Money out</Th><Th right>Net</Th></tr></thead>
                  <tbody className="divide-y divide-line">{[...d].reverse().map((m) => <tr key={m.month}><Td>{new Date(m.month + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</Td><Td right>{money(m.in)}</Td><Td right>{money(m.out)}</Td><Td right className={m.in - m.out >= 0 ? "text-in" : "text-out"}>{money(m.in - m.out)}</Td></tr>)}</tbody>
                </table></div>
              </div>); })()}
            {tab === "gst" && (() => { const d = data as Gst; const rows: [string, Sec, string][] = [["B2B invoices (registered customers)", d.b2b, `${d.b2bCount}`], ["B2C invoices (unregistered customers)", d.b2c, `${d.b2cCount}`], ["Credit notes", d.creditNotes, `${d.creditNoteCount}`], ["Inward supplies eligible for ITC", d.purchases, `${d.billCount}`]]; return (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-line p-4"><div className="text-sm text-muted">Output tax</div><div className="num mt-1 text-xl font-semibold">{money(d.outputTax)}</div></div>
                  <div className="rounded-lg border border-line p-4"><div className="text-sm text-muted">Input tax credit</div><div className="num mt-1 text-xl font-semibold">{money(d.inputTaxCredit)}</div><div className="text-xs text-muted">Only bills from GST-registered vendors</div></div>
                  <div className="rounded-lg border border-accent/40 p-4"><div className="text-sm text-muted">{d.netPayable >= 0 ? "Net GST payable" : "Credit carried forward"}</div><div className="num mt-1 text-xl font-semibold">{money(Math.abs(d.netPayable))}</div><div className="text-xs text-muted">Pay with GSTR-3B by the 20th</div></div>
                </div>
                <div className="overflow-hidden rounded-lg border border-line"><table className="w-full">
                  <thead className="border-b border-line"><tr><Th>Section</Th><Th right>Docs</Th><Th right>Taxable value</Th><Th right>CGST</Th><Th right>SGST</Th><Th right>IGST</Th></tr></thead>
                  <tbody className="divide-y divide-line">{rows.map(([label, x, n]) => <tr key={label}><Td className="font-medium">{label}</Td><Td right>{n}</Td><Td right>{money(x.taxable)}</Td><Td right>{money(x.cgst)}</Td><Td right>{money(x.sgst)}</Td><Td right>{money(x.igst)}</Td></tr>)}</tbody>
                </table></div>
                <p className="text-xs text-muted">Download the GSTR-1 JSON above and upload it in the GST portal&apos;s offline tool (or send it to your CA). Before filing GSTR-3B, accept or reject supplier invoices in IMS: anything left untouched when GSTR-2B is generated on the 14th is treated as accepted. Direct filing needs a GSP integration.</p>
              </div>); })()}
          </>
        )}
      </div>
    </Guard>
  );
}
