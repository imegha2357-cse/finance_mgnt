"use client";
import { useEffect, useState } from "react";
import { cx } from "./ui";

/* ───────────── Money, plain-language terms, freshness and sparklines ───────────── */

const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * An amount with a clear hierarchy: a small ₹, big rupees in Indian grouping, small paise.
 * size: "hero" for the one number a page is about, "lg" for KPI tiles, "md" inline.
 */
export function Money({ value, size = "md", sign, className }: { value: number; size?: "hero" | "lg" | "md"; sign?: boolean; className?: string }) {
  const neg = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs + 1e-9);
  const paise = Math.round((abs - whole) * 100);
  const big = { hero: "text-[30px] leading-9 tracking-[-0.02em]", lg: "text-[22px] leading-7 tracking-[-0.01em]", md: "" }[size];
  const small = { hero: "text-base", lg: "text-sm", md: "text-[0.85em]" }[size];
  return (
    <span className={cx("num whitespace-nowrap font-semibold", big, className)}>
      {neg ? "−" : sign ? "+" : ""}
      <span className={cx(small, "mr-0.5 font-medium opacity-70")}>₹</span>
      {rupees.format(whole)}
      {size !== "md"
        ? <span className={cx(small, "font-medium opacity-60")}>.{String(paise).padStart(2, "0")}</span>
        : paise ? <span className="opacity-70">.{String(paise).padStart(2, "0")}</span> : null}
    </span>
  );
}

/** Accounting words in plain language. */
export const GLOSSARY: Record<string, string> = {
  Receivables: "Money your customers owe you for invoices you have sent.",
  Payables: "Money you owe vendors for bills you have received.",
  "Input tax credit": "GST you paid on purchases from registered vendors. It is subtracted from the GST you collect.",
  "GST payable": "GST you collected on sales minus GST you paid on purchases: what you owe the government this month.",
  Runway: "How many months your cash lasts if you keep spending at the current rate.",
  Overdue: "Past the due date and still unpaid.",
  Accrual: "Income counts when you invoice and expenses when you are billed, not when cash moves.",
  Reconcile: "Match each line on your bank statement to a transaction in your books, so both agree.",
  "Credit note": "A document that reduces what a customer owes: for a return, a discount or a mistake.",
  "Trial balance": "Every account's total debits and credits. If the two columns match, the books balance.",
  "Balance sheet": "What the business owns, what it owes, and what is left for the owners, on one date.",
  "Profit and loss": "Income minus expenses for a period: did the business make money?",
  "Cash flow": "Money that actually came in and went out of your bank accounts.",
};

/** Hover or focus an accounting term to see what it means. */
export function Term({ children, tip }: { children: string; tip?: string }) {
  const text = tip ?? GLOSSARY[children];
  if (!text) return <>{children}</>;
  return (
    <span tabIndex={0} className="group/term relative inline-block cursor-help border-b border-dotted border-muted/70 outline-none">
      {children}
      <span role="tooltip" className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-64 rounded-md border border-line bg-raised px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink opacity-0 shadow-lg transition-opacity group-hover/term:visible group-hover/term:opacity-100 group-focus/term:visible group-focus/term:opacity-100">
        {text}
      </span>
    </span>
  );
}

/** "Updated 2 min ago" with an optional refresh button. */
export function UpdatedAgo({ at, onRefresh, refreshing }: { at: number | null; onRefresh?: () => void; refreshing?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!at) return null;
  const mins = Math.max(0, Math.floor((Math.max(now, at) - at) / 60_000));
  const label = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ago`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      Updated {label}
      {onRefresh && (
        <button onClick={onRefresh} disabled={refreshing} className="rounded px-1.5 py-0.5 text-accent hover:bg-accent-soft disabled:opacity-50" aria-label="Refresh figures">
          {refreshing ? "…" : "↻"}
        </button>
      )}
    </span>
  );
}

/** Tiny trend line for list rows. Values oldest → newest. */
export function Sparkline({ values, color = "var(--chart-in)", label }: { values: number[]; color?: string; label: string }) {
  const w = 72, h = 22;
  if (values.length < 2 || values.every((v) => v === 0)) return <span className="text-xs text-muted/60" aria-label={`${label}: no activity`}>—</span>;
  const max = Math.max(...values), min = Math.min(0, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} role="img" aria-label={label} className="inline-block align-middle">
      <title>{label}</title>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.2} fill={color} />
    </svg>
  );
}
