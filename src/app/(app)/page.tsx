"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Factory, Building2, Wallet, Landmark, CalendarClock, CheckCircle2, ChevronRight, FileWarning, PlusCircle, Receipt } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth, useData } from "@/components/auth-provider";
import { IN_COLOR, OUT_COLOR } from "@/components/cash-chart";
import { Badge, ErrorNote, Loading, Td, Th, cx } from "@/components/ui";
import { Money, Term, UpdatedAgo } from "@/components/finance-ui";
import { accountName } from "@/lib/accounts";
import { fmtDate, money, moneyCompact, thisMonth } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { AgeSplit, DashboardData, InboxItem } from "@/lib/types";

type Dash = DashboardData & { limited: boolean };

const KIND_ICON: Record<InboxItem["kind"], React.ElementType> = {
  bill_approval: CheckCircle2, missing_receipt: Receipt, overdue_invoice: AlertTriangle, bill_due: FileWarning, compliance: CalendarClock,
  msme_due: Factory,
  reimbursement: Wallet, reconcile: Landmark,
};
const monthTick = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
const monthLong = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11 } } as const;
const tip = {};

function Panel({ title, action, children, className }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("overflow-hidden rounded-lg border border-line bg-surface", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="font-semibold">{title}</h2>{action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Receivables / payables card: total unpaid with a current vs overdue bar. */
function AgingCard({ title, sub, split, newHref, listHref }: { title: React.ReactNode; sub: string; split: AgeSplit; newHref?: string; listHref: string }) {
  const pct = split.total ? (split.current / split.total) * 100 : 0;
  return (
    <Panel title={title} action={newHref && <Link href={newHref} className="flex items-center gap-1 text-sm text-accent"><PlusCircle className="size-4" />New</Link>}>
      <Link href={listHref} className="block">
        <div className="text-sm text-muted">{sub}</div>
        <Money value={split.total} size="lg" className="mt-0.5 block" />
        <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`Current ${money(split.current)}, overdue ${money(split.overdue)}`}>
          {split.current > 0 && <div style={{ width: `${pct}%`, background: IN_COLOR }} />}
          {split.overdue > 0 && <div style={{ width: `${100 - pct}%`, background: OUT_COLOR }} />}
        </div>
        <div className="num mt-3 flex gap-6 text-sm">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: IN_COLOR }} />Current: <span className="font-medium">{money(split.current)}</span></span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: OUT_COLOR }} /><Term>Overdue</Term>: <span className="font-medium">{money(split.overdue)}</span></span>
        </div>
      </Link>
    </Panel>
  );
}

function Inbox({ items }: { items: InboxItem[] }) {
  if (!items.length) return <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted"><CheckCircle2 className="size-6 text-in" />You&apos;re all caught up. Nothing is waiting on you.</div>;
  return (
    <ul className="-m-5 divide-y divide-line">
      {items.map((it, k) => {
        const Icon = KIND_ICON[it.kind];
        return (
          <li key={k}>
            <Link href={it.href} className="flex items-center gap-3 px-5 py-3 hover:bg-hover">
              <span className={cx("grid size-8 shrink-0 place-items-center rounded-md", it.severity === "high" ? "bg-out-soft text-out" : it.severity === "medium" ? "bg-warn-soft text-warn" : "bg-canvas text-muted")}><Icon className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{it.title}</div>
                <div className="truncate text-xs text-muted">{it.kind === "compliance" && it.dueDate ? `${fmtDate(it.dueDate)} · ${it.detail}` : it.detail}</div>
              </div>
              {it.amount !== undefined && <Money value={it.amount} className="text-sm" />}
              <ChevronRight className="size-4 text-muted/60" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function Dashboard() {
  const { user, org } = useAuth();
  const router = useRouter();
  const { data, error, loading, reload, updatedAt } = useData<Dash>("/api/dashboard");
  const [showAll, setShowAll] = useState(false);
  if (loading && !data) return <Loading />;
  if (!data || !user) return <div className="p-6"><ErrorNote message={error} /></div>;
  const showTab = data.limited ? "inbox" : "dashboard";
  const f = data.fiscal;

  return (
    <div>
      {/* Greeting band */}
      <div className="border-b border-line px-6 pt-5">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-lg border border-line bg-surface text-muted"><Building2 className="size-6" /></div>
          <div>
            <h1 className="text-xl font-semibold">Hello, {user.name}</h1>
            <div className="text-sm text-muted">{org?.name}</div>
          </div>
          <div className="ml-auto self-start"><UpdatedAgo at={updatedAt} onRefresh={reload} refreshing={loading} /></div>
        </div>
      </div>

      <div className="max-w-[1100px] space-y-5 px-6 py-5">
        {showTab === "inbox" && (
          <>
            <Panel title="Needs your attention"><Inbox items={data.inbox} /></Panel>
            {data.limited && (
              <Panel title="Your recent expenses" action={<Link href="/transactions" className="text-sm text-accent">View all</Link>}>
                <table className="-m-5 w-[calc(100%+2.5rem)]">
                  <thead className="border-b border-line"><tr><Th>Date</Th><Th>Description</Th><Th>Receipt</Th><Th right>Amount</Th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {data.recent.map((t) => (
                      <tr key={t.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/transactions?open=${t.id}`)}>
                        <Td>{fmtDate(t.date)}</Td><Td>{t.description}</Td>
                        <Td>{t.receipt ? <Badge tone="green">Attached</Badge> : <Badge tone="amber">Missing</Badge>}</Td>
                        <Td right>{money(t.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </>
        )}

        {showTab === "dashboard" && (
          <>
            {/* 1. Exceptions first: what needs a decision today. */}
            {data.inbox.length > 0 && (
              <Panel title={<span className="flex items-center gap-2">Needs attention <span className="rounded-full bg-out px-1.5 text-[11px] font-semibold text-on-accent">{data.inbox.length}</span></span>}
                action={data.inbox.length > 4 && <button onClick={() => setShowAll((v) => !v)} className="text-sm text-accent">{showAll ? "Show fewer" : `Show all ${data.inbox.length}`}</button>}>
                <Inbox items={showAll ? data.inbox : data.inbox.slice(0, 4)} />
              </Panel>
            )}

            {/* 2. The numbers that matter, with one hero figure. */}
            <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr_1fr]">
              <div className="rounded-lg border border-line bg-surface px-5 py-4">
                <div className="text-sm text-muted">Cash balance</div>
                <Money value={data.cashBalance} size="hero" className="mt-1 block" />
                <div className="mt-1 text-xs text-muted">All bank accounts · {fmtDate(f.start)} opening {money(f.openingCash)}</div>
              </div>
              <div className="rounded-lg border border-line bg-surface px-5 py-4">
                <div className="text-sm text-muted"><Term>GST payable</Term> this month</div>
                <Money value={Math.max(0, data.gstPayable)} size="lg" className="mt-1.5 block" />
                <div className="mt-1 text-xs text-muted">{data.gstPayable < 0 ? `Carry-forward credit ${money(-data.gstPayable)}` : "Output tax − input credit"}</div>
              </div>
              <div className="rounded-lg border border-line bg-surface px-5 py-4">
                <div className="text-sm text-muted">{data.runwayMonths === null ? <Term>Cash flow</Term> : <Term tip="How many months your cash and bank balance lasts if you keep spending more than you earn at the current rate.">Cash lasts</Term>}</div>
                <div className="num mt-1.5 text-[22px] font-semibold leading-7 tracking-[-0.01em]">{data.runwayMonths === null ? <span className="text-in">Positive</span> : <>{data.runwayMonths.toFixed(1)}<span className="ml-1 text-sm font-medium text-muted">months</span></>}</div>
                <div className="mt-1 text-xs text-muted">{data.runwayMonths === null ? "Last 3 months: more in than out" : `Spending ${money(data.monthlyBurn)} a month more than you earn`}</div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <AgingCard title={<Term tip="Money your customers owe you for invoices you have sent (Sundry Debtors).">To receive</Term>} sub="Unpaid invoices from customers" split={data.receivablesSplit} listHref="/invoices?view=sent" newHref={can(user.role, "invoice:create") ? "/invoices/new" : undefined} />
              <AgingCard title={<Term tip="Money you owe vendors for bills you have received (Sundry Creditors), after TDS.">To pay</Term>} sub="Unpaid bills to vendors" split={data.payablesSplit} listHref="/bills?view=approved" newHref={can(user.role, "bill:create") ? "/bills/new" : undefined} />
            </div>

            <Panel title={<Term>Cash flow</Term>} action={<span className="text-sm text-muted">This financial year</span>}>
              <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={f.months.filter((m) => m.month <= thisMonth())} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthTick} {...axis} />
                    <YAxis tickFormatter={(v) => moneyCompact(v)} width={60} {...axis} />
                    <Tooltip formatter={(v) => [money(Number(v)), "Cash balance"]} labelFormatter={(m) => monthLong(String(m))} {...tip} />
                    <Area type="monotone" dataKey="balance" stroke={IN_COLOR} strokeWidth={2} fill={IN_COLOR} fillOpacity={0.12} dot={{ r: 3, fill: IN_COLOR }} />
                  </AreaChart>
                </ResponsiveContainer>
                <dl className="num space-y-4 text-right text-sm">
                  <div><dt className="text-muted">Cash as on {fmtDate(f.start)}</dt><dd className="text-lg font-semibold">{money(f.openingCash)}</dd></div>
                  <div><dt className="text-muted">Incoming</dt><dd className="text-lg font-semibold">{money(f.incoming)} <span className="text-sm font-normal text-muted">( + )</span></dd></div>
                  <div><dt className="text-muted">Outgoing</dt><dd className="text-lg font-semibold">{money(f.outgoing)} <span className="text-sm font-normal text-muted">( − )</span></dd></div>
                  <div className="border-t border-line pt-3"><dt className="text-muted">Cash as on today</dt><dd className="text-lg font-semibold">{money(f.closingCash)} <span className="text-sm font-normal text-muted">( = )</span></dd></div>
                </dl>
              </div>
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Income and expense" action={<span className="text-sm text-muted">This financial year</span>}>
                <div className="num mb-3 flex gap-8 text-sm">
                  <div><div className="flex items-center gap-1.5 text-muted"><span className="size-2.5 rounded-sm" style={{ background: IN_COLOR }} />Total Income</div><div className="text-lg font-semibold">{money(data.incomeExpense.reduce((a, m) => a + m.income, 0))}</div></div>
                  <div><div className="flex items-center gap-1.5 text-muted"><span className="size-2.5 rounded-sm" style={{ background: OUT_COLOR }} />Total Expenses</div><div className="text-lg font-semibold">{money(data.incomeExpense.reduce((a, m) => a + m.expense, 0))}</div></div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.incomeExpense} barGap={2} barCategoryGap="24%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthTick} {...axis} />
                    <YAxis tickFormatter={(v) => moneyCompact(v)} width={56} {...axis} />
                    <Tooltip formatter={(v, n) => [money(Number(v)), n === "income" ? "Income" : "Expense"]} labelFormatter={(m) => monthLong(String(m))} {...tip} />
                    <Bar dataKey="income" fill={IN_COLOR} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                    <Bar dataKey="expense" fill={OUT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-muted">* Excludes GST. Counted on an <Term>Accrual</Term> basis.</p>
              </Panel>

              <Panel title="Top expenses" action={<span className="text-sm text-muted">This financial year</span>}>
                {data.topExpenses.length === 0 ? <div className="py-10 text-center text-sm text-muted">No expense recorded for this fiscal year</div> : (
                  <ul className="space-y-4">
                    {data.topExpenses.map((e) => (
                      <li key={e.name}>
                        <div className="flex justify-between text-sm"><span>{e.name}</span><span className="num font-medium">{money(e.amount)}</span></div>
                        <div className="mt-1.5 h-2 rounded-full bg-line"><div className="h-2 rounded-full" style={{ width: `${(e.amount / data.topExpenses[0].amount) * 100}%`, background: OUT_COLOR }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title="Recent transactions" action={<Link href="/transactions" className="text-sm text-accent">View all</Link>}>
              <div className="-m-5 overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-line"><tr><Th>Date</Th><Th>Description</Th><Th>Category</Th><Th>Receipt</Th><Th right>Amount</Th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {data.recent.map((t) => (
                      <tr key={t.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/transactions?open=${t.id}`)}>
                        <Td className="whitespace-nowrap">{fmtDate(t.date)}</Td>
                        <Td>{t.description}</Td>
                        <Td className="text-muted">{t.linkedType === "bill" ? "Bill payment" : t.linkedType === "invoice" ? "Customer payment" : t.linkedType === "reimbursement" ? "Claim reimbursement" : accountName(t.account)}</Td>
                        <Td>{t.receipt ? <Badge tone="green">Attached</Badge> : <Badge tone="amber">Missing</Badge>}</Td>
                        <Td right><Money value={t.direction === "in" ? t.amount : -t.amount} sign className={t.direction === "in" ? "text-in font-medium" : "font-medium"} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
