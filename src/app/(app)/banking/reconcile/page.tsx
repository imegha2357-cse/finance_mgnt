"use client";
import { useRef, useState } from "react";
import { Check, CheckCheck, Link2, Plus, Trash2, Undo2, Upload } from "lucide-react";
import { useAuth, useData } from "@/components/auth-provider";
import { Guard } from "@/components/guard";
import { Badge, Button, Empty, ErrorNote, ListHeader, Loading, Select, useToast } from "@/components/ui";
import { EXPENSE_ACCOUNTS, INCOME_ACCOUNTS, accountName, suggestAccount } from "@/lib/accounts";
import { fmtDate, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { BankLine, Transaction } from "@/lib/types";

type Recon = {
  lines: BankLine[];
  suggestions: Record<string, { txn: Transaction; score: number; reason: string }[]>;
  summary: { total: number; matched: number; unmatched: number };
};

const SAMPLE = `Date,Narration,Ref No,Withdrawal Amt,Deposit Amt
05/11/2026,NEFT-ACME SUPPLIES-INV 221,UTR0001,"12,500.00",
06/11/2026,UPI-KAVERI FOODS-PAYMENT,UTR0002,,"45,000.00"`;

function LineRow({ line, recon, txns, onAction, writable }: {
  line: BankLine; recon: Recon; txns: Transaction[]; writable: boolean;
  onAction: (lineId: string, body: Record<string, unknown>, msg: string) => Promise<void>;
}) {
  const matched = line.matchedTxnId ? txns.find((t) => t.id === line.matchedTxnId) : undefined;
  const sugg = recon.suggestions[line.id] ?? [];
  const auto = suggestAccount(line.description, line.direction);
  const [account, setAccount] = useState(auto.account);
  const [pick, setPick] = useState("");
  const candidates = txns.filter((t) => !t.bankLineId && t.direction === line.direction && Math.abs(t.amount - line.amount) < 0.01 && t.status === "posted");
  return (
    <div className="grid gap-4 border-b border-line px-6 py-4 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted">{fmtDate(line.date)}{line.reference && <span>· {line.reference}</span>}</div>
        <div className="mt-0.5 font-medium">{line.description}</div>
        <div className={`num mt-0.5 text-lg font-semibold ${line.direction === "in" ? "text-in" : ""}`}>{line.direction === "in" ? "+" : "−"}{money(line.amount)}</div>
      </div>
      <div className="text-sm">
        {matched ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-in-soft px-3 py-2">
            <div><div className="flex items-center gap-1.5 font-medium text-in"><Check className="size-4" />Matched</div><div className="text-in">{matched.description} · {fmtDate(matched.date)}</div></div>
            {writable && <Button size="sm" variant="ghost" onClick={() => onAction(line.id, { action: "unmatch" }, "Unmatched")}><Undo2 className="size-3.5" />Undo</Button>}
          </div>
        ) : (
          <div className="space-y-2">
            {sugg.map((s) => (
              <div key={s.txn.id} className="flex items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent-soft/60 px-3 py-2">
                <div><div className="font-medium">{s.txn.description}</div><div className="text-xs text-muted">{fmtDate(s.txn.date)} · {s.reason}</div></div>
                {writable && <Button size="sm" variant="primary" onClick={() => onAction(line.id, { action: "match", txnId: s.txn.id }, "Matched")}><Link2 className="size-3.5" />Match</Button>}
              </div>
            ))}
            {writable && (
              <div className="flex flex-wrap items-center gap-2">
                {candidates.length > 0 && !sugg.length && (
                  <>
                    <Select value={pick} onChange={(e) => setPick(e.target.value)} className="h-8! w-64! text-xs"><option value="">Match to a transaction…</option>{candidates.map((t) => <option key={t.id} value={t.id}>{fmtDate(t.date)} · {t.description}</option>)}</Select>
                    <Button size="sm" disabled={!pick} onClick={() => onAction(line.id, { action: "match", txnId: pick }, "Matched")}>Match</Button>
                  </>
                )}
                <Select value={account} onChange={(e) => setAccount(e.target.value)} className="h-8! w-52! text-xs">
                  {(line.direction === "out" ? EXPENSE_ACCOUNTS : INCOME_ACCOUNTS).map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                </Select>
                <Button size="sm" onClick={() => onAction(line.id, { action: "create", account }, `Booked as ${accountName(account)}`)}><Plus className="size-3.5" />Book as new</Button>
                <button onClick={() => { if (confirm("Remove this statement line?")) void onAction(line.id, { action: "delete" }, "Line removed"); }} className="rounded p-1 text-muted hover:text-out" aria-label="Remove line"><Trash2 className="size-4" /></button>
              </div>
            )}
            {!sugg.length && <div className="text-xs text-muted">No booked transaction with this amount{account === auto.account ? ` · suggested category: ${accountName(auto.account)}` : ""}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReconcilePage() {
  const { api, user } = useAuth();
  const { data, error, loading, reload } = useData<Recon>("/api/banking/reconcile");
  const { data: txns, reload: reloadTxns } = useData<Transaction[]>("/api/transactions");
  const [view, setView] = useState<"unmatched" | "matched" | "all">("unmatched");
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast, toastNode } = useToast();
  const writable = !!user && can(user.role, "txn:edit");

  const onAction = async (lineId: string, body: Record<string, unknown>, msg: string) => {
    setErr(null);
    try { await api(`/api/banking/lines/${lineId}`, { method: "POST", json: body }); toast(msg); reload(); reloadTxns(); }
    catch (e) { setErr((e as Error).message); }
  };
  const importFile = async (file: File) => {
    setImporting(true); setErr(null);
    try {
      const r = await api<{ imported: number; skipped: number }>("/api/banking/import", { method: "POST", json: { csv: await file.text() } });
      toast(`${r.imported} lines imported${r.skipped ? `, ${r.skipped} duplicates skipped` : ""}`);
      setView("unmatched"); reload();
    } catch (e) { setErr((e as Error).message); } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const lines = (data?.lines ?? []).filter((l) => view === "all" || (view === "matched" ? l.matchedTxnId : !l.matchedTxnId));

  return (
    <Guard need="books:read">
      <ListHeader views={[{ value: "unmatched", label: "To Reconcile" }, { value: "matched", label: "Matched" }, { value: "all", label: "All Statement Lines" }]} view={view} onView={setView} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-6 py-2.5 text-sm">
        {data && <span className="text-muted">Statement lines: <b className="text-ink">{data.summary.total}</b> · Matched: <b className="text-ink">{data.summary.matched}</b> · To reconcile: <b className="text-ink">{data.summary.unmatched}</b></span>}
        {writable && (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
            <Button size="sm" variant="primary" loading={importing} onClick={() => fileRef.current?.click()}><Upload className="size-3.5" />Import statement (CSV)</Button>
          </div>
        )}
      </div>
      <div className="px-6 pt-3"><ErrorNote message={error ?? err} /></div>
      {loading && !data ? <Loading /> : !lines.length ? (
        <div>
          <Empty icon={view === "unmatched" ? CheckCheck : Upload} title={view === "unmatched" ? "Everything is reconciled" : "Import your first bank statement"} detail={view === "unmatched" ? "Every statement line matches a transaction in your books." : "Download a CSV statement from your bank's net banking and import it here. A sample format is below."} />
          <details className="mx-auto mb-10 max-w-xl text-sm text-muted"><summary className="cursor-pointer">Accepted CSV format</summary><pre className="mt-2 overflow-x-auto rounded-md bg-canvas p-3 text-xs">{SAMPLE}</pre><p className="mt-2">Dates as DD/MM/YYYY, YYYY-MM-DD or 05-Nov-2026. Either Withdrawal/Deposit (Debit/Credit) columns or one signed Amount column.</p></details>
        </div>
      ) : (
        <div>{lines.map((l) => <LineRow key={l.id} line={l} recon={data!} txns={txns ?? []} onAction={onAction} writable={writable} />)}</div>
      )}
      {data && data.summary.unmatched === 0 && data.summary.total > 0 && view !== "unmatched" && <div className="px-6 py-3"><Badge tone="green">All lines reconciled</Badge></div>}
      {toastNode}
    </Guard>
  );
}
