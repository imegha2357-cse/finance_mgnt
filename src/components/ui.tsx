"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, Loader2, type LucideIcon } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean };
export function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...p }: BtnProps) {
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-accent text-on-accent hover:bg-accent-hover",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-canvas",
        variant === "ghost" && "text-muted hover:bg-canvas hover:text-ink",
        variant === "danger" && "border border-out/30 bg-surface text-out hover:bg-out-soft",
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: "bg-in-soft text-in ring-in/25",
  red: "bg-out-soft text-out ring-out/25",
  amber: "bg-warn-soft text-warn ring-warn/25",
  blue: "bg-accent-soft text-accent ring-accent/25",
  gray: "bg-canvas text-muted ring-line-strong",
  teal: "bg-accent-soft text-accent ring-accent/25",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", BADGE[tone])}>{children}</span>;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-out">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const inputCls = "h-9 w-full rounded-md border border-line bg-surface dark:bg-canvas px-3 text-sm outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/15";
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, "pr-8", p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(inputCls, "h-auto min-h-20 py-2", p.className)} />
);

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

/** Right-hand side panel: details open next to the list instead of on a new page. */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <aside className="anim-pop absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-raised shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-canvas" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </aside>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />
      <div className={cx("anim-pop relative w-full rounded-xl border border-line bg-raised shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-canvas" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", value === t.value ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink")}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded bg-canvas px-1.5 text-xs text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Designed empty state: says what belongs here and offers the first step. */
type EmptyAction = { label: string; href?: string; onClick?: () => void };
export function Empty({ title, detail, icon: Icon, action, secondary }: { title: string; detail?: string; icon?: LucideIcon; action?: EmptyAction; secondary?: EmptyAction }) {
  const btn = (a: EmptyAction, primary: boolean) => {
    const cls = primary
      ? "inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-on-accent hover:bg-accent-hover"
      : "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-accent hover:bg-accent-soft";
    return a.href ? <Link href={a.href} className={cls}>{a.label}</Link> : <button onClick={a.onClick} className={cls}>{a.label}</button>;
  };
  return (
    <div className="mx-auto max-w-sm px-6 py-14 text-center">
      {Icon && <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent"><Icon className="size-6" /></div>}
      <p className="font-medium">{title}</p>
      {detail && <p className="mt-1 text-sm text-muted">{detail}</p>}
      {(action || secondary) && <div className="mt-5 flex flex-wrap justify-center gap-2">{action && btn(action, true)}{secondary && btn(secondary, false)}</div>}
    </div>
  );
}

/** Grey placeholder bar that shimmers while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton h-3", className)} />;
}

/** Loading state shaped like the page that is coming (a title and table rows), not a spinner. */
export function Loading({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="px-6 py-5">
      <Skeleton className="mb-6 h-6 w-48" />
      <div className="divide-y divide-line rounded-lg border border-line">
        {Array.from({ length: rows }, (_, k) => (
          <div key={k} className="flex items-center gap-6 px-4 py-3.5">
            <Skeleton className="w-20" /><Skeleton className="flex-1" /><Skeleton className="hidden w-24 sm:block" /><Skeleton className="w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Spinner for small inline waits. */
export function Spinner() {
  return <div className="flex justify-center py-8 text-muted"><Loader2 className="size-5 animate-spin" /></div>;
}

/** Error banner. It scrolls itself into view, so a failed save at the bottom of a long form is never missed. */
export function ErrorNote({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (message) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [message]);
  if (!message) return null;
  return <div ref={ref} role="alert" className="mb-3 rounded-lg border border-out/30 bg-out-soft px-3 py-2 text-sm text-out">{message}</div>;
}

export function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <th className={cx("px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted", right ? "text-right" : "text-left", className)}>{children}</th>;
}
export function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cx("cell px-4 text-sm", right && "num text-right", className)}>{children}</td>;
}

/** Tiny toast for confirmations. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2800);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div role="status" className="anim-slide fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas shadow-lg md:bottom-5">{msg}</div>
  ) : null;
  return { toast: setMsg, toastNode: node };
}

/* ───────────── List & form building blocks (books-style layout) ───────────── */

/** List header: a view switcher as the title ("All Invoices ▾"), a primary "+ New" and a "⋯" menu. */
export function ListHeader<T extends string>({ views, view, onView, newHref, newLabel = "New", menu }: {
  views: { value: T; label: string }[]; view: T; onView: (v: T) => void; newHref?: string; newLabel?: string;
  menu?: { label: string; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const current = views.find((v) => v.value === view)?.label ?? views[0]?.label;
  return (
    <div className="flex items-center justify-between border-b border-line px-6 py-3.5">
      <div className="relative">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xl font-semibold text-ink">
          {current}<svg className="size-4 text-accent" viewBox="0 0 20 20" fill="currentColor"><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" /></svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <ul className="absolute left-0 top-full z-40 mt-1 w-56 anim-pop rounded-md border border-line bg-raised py-1 shadow-lg">
              {views.map((v) => (
                <li key={v.value}><button onClick={() => { onView(v.value); setOpen(false); }} className={cx("w-full px-3 py-1.5 text-left text-sm hover:bg-accent-soft", v.value === view && "font-medium text-accent")}>{v.label}</button></li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {newHref && <Link href={newHref} className="inline-flex h-9 items-center gap-1 rounded-md bg-accent px-3.5 text-sm font-medium text-on-accent hover:bg-accent-hover"><span className="text-lg leading-none">+</span>{newLabel}</Link>}
        {menu && menu.length > 0 && (
          <div className="relative">
            <button onClick={() => setMore(!more)} className="grid size-9 place-items-center rounded-md border border-line text-muted hover:bg-canvas" aria-label="More actions">⋯</button>
            {more && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMore(false)} />
                <ul className="absolute right-0 top-full z-40 mt-1 w-48 anim-pop rounded-md border border-line bg-raised py-1 shadow-lg">
                  {menu.map((m) => <li key={m.label}><button onClick={() => { m.onClick(); setMore(false); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-soft">{m.label}</button></li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Edge-to-edge list table used by every module list. */
export function ListTable({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto md:overflow-x-visible">
      <table className="w-full">
        <thead className="sticky top-0 z-10 border-b border-line bg-surface shadow-[0_1px_0_var(--line)] md:top-12">{head}</thead>
        <tbody className="divide-y divide-line [&>tr:hover]:bg-hover">{children}</tbody>
      </table>
    </div>
  );
}

/** Uppercase coloured status text, as list views show it. */
export function StatusText({ tone, children }: { tone: "green" | "orange" | "blue" | "gray" | "red"; children: React.ReactNode }) {
  const c = { green: "text-in", orange: "text-warn", blue: "text-accent", gray: "text-muted", red: "text-out" }[tone];
  return <span className={cx("text-xs font-semibold uppercase tracking-wide", c)}>{children}</span>;
}

/** Full-page form header: icon, title, close. */
export function FormPage({ title, icon, onClose, children, footer }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  const footerRef = useRef<HTMLDivElement>(null);
  // Ctrl/⌘+S saves: it presses the footer's primary button (marked data-save, else the accent one).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Esc leaves the current field first; a second Esc closes the form (so one stray keypress never loses work).
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) {
        const el = document.activeElement as HTMLElement | null;
        if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.blur();
        else onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const f = footerRef.current;
        const btn = f?.querySelector<HTMLButtonElement>("button[data-save]:not(:disabled)") ?? f?.querySelector<HTMLButtonElement>("button.bg-accent:not(:disabled)");
        btn?.click();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold">{icon}{title}</h1>
        <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas" aria-label="Close"><X className="size-5" /></button>
      </div>
      <div className="flex-1 pb-6">{children}</div>
      <div ref={footerRef} className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.08)]">
        {footer}
        <span className="ml-auto hidden text-xs text-muted lg:inline"><kbd>Ctrl</kbd> <kbd>S</kbd> save · <kbd>Enter</kbd> next field · <kbd>Esc</kbd> twice to close</span>
      </div>
    </div>
  );
}

/** Label on the left, field on the right; required labels are red with an asterisk. */
export function FormRow({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    // A <label> around the control associates the text with the first input inside it (screen readers, tap-to-focus).
    <label className="grid items-start gap-2 py-2 sm:grid-cols-[180px_minmax(0,420px)]">
      <span className="pt-2 text-sm text-ink">{label}{required && <span className="ml-0.5 text-out" aria-hidden="true">*</span>}</span>
      <div>
        {children}
        {error ? <span className="mt-1 block text-xs text-out">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
      </div>
    </label>
  );
}

/** Shown instead of a page the current role is not allowed to use. */
export function NoAccess({ what = "this page" }: { what?: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-lg font-medium">You don&apos;t have access to {what}</p>
      <p className="mt-1 text-sm text-muted">Ask an admin to change your role in Settings → Team.</p>
    </div>
  );
}

/** Small key–value grid used in detail panels. */
export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
      {rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></Fragment>)}
    </dl>
  );
}

/** Triggers a browser download of text content (CSV exports). */
export function downloadText(text: string, filename: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
