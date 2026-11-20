"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Home, ShoppingCart, ShoppingBag, Landmark, BarChart3, Settings, Search, LogOut, ChevronDown, ChevronRight, Plus, Bell, Package, Loader2,
  Moon, Sun, Monitor, Keyboard, FileText, Receipt, X, Rows3, Rows4,
} from "lucide-react";
import { useAuth } from "./auth-provider";
import { cx, Loading } from "./ui";
import { can, type Action } from "@/lib/permissions";
import { ROLES, type InboxItem, type Role, type SearchHit } from "@/lib/types";
import { fmtDate, money } from "@/lib/format";
import { usePref, type Theme } from "@/lib/prefs";

type Leaf = { href: string; label: string; need?: Action; newHref?: string; newNeed?: Action; search?: string };
type Group = { key: string; label: string; icon: React.ElementType; href?: string; need?: Action; children?: Leaf[]; soon?: boolean; search?: string };

const NAV: Group[] = [
  { key: "home", label: "Home", icon: Home, href: "/", search: "Ledgerly" },
  { key: "items", label: "Items", icon: Package, href: "/items", need: "books:read", search: "Items" },
  {
    key: "sales", label: "Sales", icon: ShoppingCart, need: "books:read", children: [
      { href: "/customers", label: "Customers", newHref: "/customers?new=1", newNeed: "party:write", search: "Customers" },
      { href: "/invoices", label: "Invoices", newHref: "/invoices/new", newNeed: "invoice:create", search: "Invoices" },
      { href: "/recurring-invoices", label: "Recurring invoices", search: "Recurring invoices" },
      { href: "/payments-received", label: "Payments received", newHref: "/payments-received/new", newNeed: "invoice:update", search: "Payments received" },
      { href: "/credit-notes", label: "Credit notes", newHref: "/credit-notes/new", newNeed: "invoice:update", search: "Credit notes" },
    ],
  },
  {
    key: "purchases", label: "Purchases", icon: ShoppingBag, need: "books:read", children: [
      { href: "/vendors", label: "Vendors", newHref: "/vendors?new=1", newNeed: "party:write", search: "Vendors" },
      { href: "/bills", label: "Bills", newHref: "/bills/new", newNeed: "bill:create", search: "Bills" },
      { href: "/payments-made", label: "Payments made", newHref: "/payments-made/new", newNeed: "bill:pay", search: "Payments made" },
    ],
  },
  {
    key: "banking", label: "Banking", icon: Landmark, children: [
      { href: "/transactions", label: "Transactions", newHref: "/transactions?new=1", newNeed: "txn:create", search: "Transactions" },
      { href: "/banking/reconcile", label: "Reconcile", need: "books:read", search: "Bank Statement" },
    ],
  },
  { key: "reports", label: "Reports", icon: BarChart3, href: "/reports", need: "reports:read", search: "Reports" },
];
const QUICK_CREATE: { label: string; href: string; need: Action; group: string }[] = [
  { group: "Sales", label: "Invoice", href: "/invoices/new", need: "invoice:create" },
  { group: "Sales", label: "Customer payment", href: "/payments-received/new", need: "invoice:update" },
  { group: "Sales", label: "Customer", href: "/customers?new=1", need: "party:write" },
  { group: "Purchases", label: "Bill", href: "/bills/new", need: "bill:create" },
  { group: "Purchases", label: "Vendor payment", href: "/payments-made/new", need: "bill:pay" },
  { group: "Purchases", label: "Vendor", href: "/vendors?new=1", need: "party:write" },
  { group: "Sales", label: "Credit note", href: "/credit-notes/new", need: "invoice:update" },
  { group: "Banking", label: "Expense or transaction", href: "/transactions?new=1", need: "txn:create" },
  { group: "Banking", label: "Item", href: "/items", need: "party:write" },
];

const COMMANDS: { label: string; href: string; need?: Action; keywords: string }[] = [
  { label: "Home dashboard", href: "/", keywords: "dashboard home inbox" },
  ...QUICK_CREATE.map((q) => ({ label: `New ${q.label.toLowerCase()}`, href: q.href, need: q.need, keywords: `${q.group} create add` })),
  { label: "Unpaid invoices", href: "/invoices?view=sent", need: "books:read", keywords: "receivable outstanding" },
  { label: "Bills waiting for approval", href: "/bills?view=pending_approval", need: "books:read", keywords: "approve pending" },
  { label: "Payments received", href: "/payments-received", need: "books:read", keywords: "receipts collections" },
  { label: "Payments made", href: "/payments-made", need: "books:read", keywords: "vendor payouts" },
  { label: "Profit and loss", href: "/reports?tab=pnl", need: "reports:read", keywords: "p&l profit report" },
  { label: "GST summary", href: "/reports?tab=gst", need: "reports:read", keywords: "gst gstr tax" },
  { label: "Team and roles", href: "/settings?tab=team", keywords: "team users roles invite" },
];

const KIND_LABEL: Record<SearchHit["kind"], string> = { invoice: "Invoice", bill: "Bill", customer: "Customer", vendor: "Vendor", transaction: "Transaction", credit_note: "Credit note" };

function CommandPalette({ onClose, role, scope }: { onClose: () => void; role: Role; scope: string }) {
  const router = useRouter();
  const { api } = useAuth();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const commands = useMemo(() => COMMANDS.filter((c) => (!c.need || can(role, c.need)) && (c.label + " " + c.keywords).toLowerCase().includes(q.toLowerCase())), [q, role]);
  // Debounced search across invoices, bills, customers, vendors and transactions.
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      setSearching(true);
      api<SearchHit[]>(`/api/search?q=${encodeURIComponent(q.trim())}`).then(setHits).catch(() => setHits([])).finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, api]);
  const shownHits = q.trim().length < 2 ? [] : hits;
  const items = [...shownHits.map((h) => ({ key: `h-${h.kind}-${h.id}`, href: h.href, node: (
    <div className="flex items-center gap-3"><span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-muted">{KIND_LABEL[h.kind]}</span><span className="min-w-0 flex-1"><span className="block truncate">{h.title}</span><span className="block truncate text-xs text-muted">{h.subtitle}</span></span>{h.amount !== undefined && <span className="num text-xs">{money(h.amount)}</span>}</div>
  ) })), ...commands.map((c) => ({ key: `c-${c.href}-${c.label}`, href: c.href, node: <span>{c.label}</span> }))];
  const run = (href: string) => { onClose(); router.push(href); };
  return (
    <div className="fixed inset-0 z-50 flex justify-center p-4 pt-[10vh]">
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />
      <div className="anim-pop relative h-fit w-full max-w-xl overflow-hidden rounded-lg border border-line bg-raised shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4">
          {searching ? <Loader2 className="size-4 animate-spin text-muted" /> : <Search className="size-4 text-muted" />}
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
              if (e.key === "Enter" && items[i]) run(items[i].href);
              if (e.key === "Escape") onClose();
            }}
            placeholder={`Search invoices, bills, customers… (in ${scope}) or type a command`} className="h-12 w-full bg-transparent text-sm outline-none" />
        </div>
        <ul className="max-h-96 overflow-y-auto p-1.5">
          {shownHits.length > 0 && <li className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted">Records</li>}
          {items.map((it, k) => (
            <li key={it.key}>
              {k === shownHits.length && <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted">Actions</div>}
              <button onMouseEnter={() => setI(k)} onClick={() => run(it.href)} className={cx("w-full rounded-md px-3 py-2 text-left text-sm", k === i && "bg-accent-soft text-accent")}>{it.node}</button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-sm text-muted">{searching ? "Searching…" : "No matches"}</li>}
        </ul>
      </div>
    </div>
  );
}

function Notifications() {
  const { api, status } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  useEffect(() => {
    if (status !== "ready") return;
    let alive = true;
    const load = () => api<InboxItem[]>("/api/inbox").then((d) => alive && setItems(d)).catch(() => {});
    void load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [api, status]);
  const count = items?.length ?? 0;
  const urgent = (items ?? []).some((i) => i.severity === "high");
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative text-white/80 hover:text-white" aria-label={`Needs attention (${count})`}>
        <Bell className="size-[18px]" />
        {count > 0 && <span className={cx("absolute -right-2 -top-1.5 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4", urgent ? "bg-out text-on-accent" : "bg-white/80 text-navy")}>{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute right-0 top-full z-50 mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-raised text-ink shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5"><span className="text-sm font-semibold">Needs attention · {count}</span><Link href="/" onClick={() => setOpen(false)} className="text-xs text-accent">Open dashboard</Link></div>
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {(items ?? []).slice(0, 12).map((it, k) => (
                <li key={k}><Link href={it.href} onClick={() => setOpen(false)} className="block px-4 py-2.5 hover:bg-hover">
                  <div className="flex justify-between gap-2 text-sm"><span className="truncate font-medium">{it.title}</span>{it.amount !== undefined && <span className="num shrink-0">{money(it.amount)}</span>}</div>
                  <div className="truncate text-xs text-muted">{it.kind === "compliance" && it.dueDate ? `${fmtDate(it.dueDate)} · ` : ""}{it.detail}</div>
                </Link></li>
              ))}
              {items && !items.length && <li className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up</li>}
              {!items && <li className="px-4 py-8 text-center text-sm text-muted">Loading…</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function QuickCreate({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const items = QUICK_CREATE.filter((q) => can(role, q.need));
  if (!items.length) return null;
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="grid size-8 place-items-center rounded-md bg-accent text-on-accent hover:bg-accent-hover" aria-label="Quick create"><Plus className="size-5" /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute right-0 top-full z-50 mt-2 grid w-[min(560px,calc(100vw-2rem))] grid-cols-2 gap-4 rounded-lg border border-line bg-raised p-4 text-ink shadow-xl sm:grid-cols-3">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{g}</div>
                <ul className="space-y-1">
                  {items.filter((i) => i.group === g).map((i) => (
                    <li key={i.href}><Link href={i.href} onClick={() => setOpen(false)} className="flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-1 text-sm hover:bg-accent-soft hover:text-accent"><Plus className="size-3.5 shrink-0" />{i.label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, signOut, mode, demoRole, setDemoRole } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="grid size-8 place-items-center rounded-full bg-white/90 text-xs font-semibold text-navy" aria-label="Account">{initials}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-line bg-raised p-3 text-ink shadow-xl">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted">{user.email}</div>
            {mode === "demo" ? (
              <label className="mt-2 block text-xs text-muted">Demo: view the app as
                <select value={demoRole} onChange={(e) => setDemoRole(e.target.value as Role)} className="mt-1 block h-9 w-full rounded-md border border-line bg-canvas px-2 text-sm text-ink">
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
            ) : <div className="mt-1 text-xs text-muted">Role: {ROLES.find((r) => r.value === user.role)?.label}</div>}
            <ThemePicker />
            <DensityPicker />
            <button onClick={() => { setOpen(false); window.dispatchEvent(new Event("ledgerly-shortcuts")); }} className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover"><Keyboard className="size-4" />Keyboard shortcuts <kbd className="ml-auto">?</kbd></button>
            <button onClick={() => void signOut()} className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-out hover:bg-out-soft"><LogOut className="size-4" />Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Keyboard shortcuts: "g" then a key goes somewhere, "n" then a key creates something. */
const GO = [
  { key: "d", label: "Dashboard", href: "/" },
  { key: "i", label: "Invoices", href: "/invoices" },
  { key: "c", label: "Customers", href: "/customers" },
  { key: "b", label: "Bills", href: "/bills" },
  { key: "v", label: "Vendors", href: "/vendors" },
  { key: "t", label: "Transactions", href: "/transactions" },
  { key: "r", label: "Reports", href: "/reports" },
  { key: "s", label: "Settings", href: "/settings" },
];
const NEW = [
  { key: "i", label: "Invoice", href: "/invoices/new" },
  { key: "b", label: "Bill", href: "/bills/new" },
  { key: "e", label: "Expense / transaction", href: "/transactions?new=1" },
  { key: "c", label: "Customer", href: "/customers?new=1" },
  { key: "v", label: "Vendor", href: "/vendors?new=1" },
  { key: "p", label: "Customer payment", href: "/payments-received/new" },
];

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return <li className="flex items-center justify-between py-1.5 text-sm"><span>{label}</span><span className="flex gap-1">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span></li>;
}

function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen((o) => !o);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("ledgerly-shortcuts", show);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("ledgerly-shortcuts", show); window.removeEventListener("keydown", esc); };
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[8vh]" role="dialog" aria-label="Keyboard shortcuts">
      <div className="fixed inset-0 bg-black/45" onClick={() => setOpen(false)} />
      <div className="anim-pop relative w-full max-w-2xl rounded-xl border border-line bg-raised shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold"><Keyboard className="size-4" />Keyboard shortcuts</h2>
          <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:bg-hover" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">Go to</h3>
            <ul className="divide-y divide-line">{GO.map((g) => <ShortcutRow key={g.key} keys={["g", g.key]} label={g.label} />)}</ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">Create</h3>
            <ul className="divide-y divide-line">{NEW.map((g) => <ShortcutRow key={g.key} keys={["n", g.key]} label={`New ${g.label.toLowerCase()}`} />)}</ul>
            <h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wider text-muted">Anywhere</h3>
            <ul className="divide-y divide-line">
              <ShortcutRow keys={["/"]} label="Search records" />
              <ShortcutRow keys={["Ctrl", "K"]} label="Command palette" />
              <ShortcutRow keys={["Ctrl", "S"]} label="Save the form" />
              <ShortcutRow keys={["Enter"]} label="Next cell in item table" />
              <ShortcutRow keys={["Esc"]} label="Close panel or dialog" />
              <ShortcutRow keys={["?"]} label="This list" />
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];
function ThemePicker() {
  const [theme, setTheme] = usePref("theme");
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-1.5 text-xs text-muted">Theme</div>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-canvas p-0.5" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t.value} role="radio" aria-checked={theme === t.value} onClick={() => setTheme(t.value)} className={cx("flex items-center justify-center gap-1 rounded px-2 py-1 text-xs", theme === t.value ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink")}>
            <t.icon className="size-3.5" />{t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
function DensityPicker() {
  const [density, setDensity] = usePref("density");
  return (
    <div className="mt-2">
      <div className="mb-1.5 text-xs text-muted">Table rows</div>
      <div className="grid grid-cols-2 gap-1 rounded-md bg-canvas p-0.5" role="radiogroup" aria-label="Table density">
        {([{ value: "comfortable", label: "Comfortable", icon: Rows3 }, { value: "compact", label: "Compact", icon: Rows4 }] as const).map((d) => (
          <button key={d.value} role="radio" aria-checked={density === d.value} onClick={() => setDensity(d.value)} className={cx("flex items-center justify-center gap-1 rounded px-2 py-1 text-xs", density === d.value ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink")}>
            <d.icon className="size-3.5" />{d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
function ThemeQuickToggle() {
  const [theme, setTheme] = usePref("theme");
  const dark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && document.documentElement.classList.contains("dark"));
  return (
    <button onClick={() => setTheme(dark ? "light" : "dark")} className="text-white/80 hover:text-white" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"}>
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

/** Phones get a thumb-reachable bottom bar instead of the sidebar. */
function MobileTabBar({ isActive, onMore, role }: { isActive: (h: string) => boolean; onMore: () => void; role: Role }) {
  const path = usePathname();
  if (/\/(new|edit)$/.test(path)) return null; // forms have their own sticky save bar
  const tabs = [
    { href: "/", label: "Home", icon: Home },
    ...(can(role, "books:read") ? [{ href: "/invoices", label: "Invoices", icon: FileText }, { href: "/bills", label: "Bills", icon: Receipt }] : []),
    { href: "/transactions", label: "Banking", icon: Landmark },
  ];
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", isActive(t.href) ? "font-medium text-accent" : "text-muted")}>
          <t.icon className="size-5" />{t.label}
        </Link>
      ))}
      <button onClick={onMore} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted"><Search className="size-5" />Search</button>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user, org, mode } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Visitors who are not signed in see the public homepage first; deep links go straight to sign-in.
    if (status === "signed_out") router.replace(path === "/" ? "/welcome" : "/login");
    if (status === "config_error") router.replace("/login");
    if (status === "needs_org") router.replace("/onboarding");
  }, [status, router, path]);

  // Keyboard-first: "/" or Ctrl+K search, "g x" go to, "n x" new, "?" shows the list.
  useEffect(() => {
    let prefix: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); setPalette(true); return; }
      if (e.key === "?") { e.preventDefault(); window.dispatchEvent(new Event("ledgerly-shortcuts")); return; }
      const k = e.key.toLowerCase();
      if (prefix) {
        const map = prefix === "g" ? GO : NEW;
        const hit = map.find((m) => m.key === k);
        prefix = null;
        clearTimeout(timer);
        if (hit) { e.preventDefault(); router.push(hit.href); }
        return;
      }
      if (k === "g" || k === "n") { prefix = k; timer = setTimeout(() => (prefix = null), 1200); }
    };
    window.addEventListener("keydown", h);
    return () => { window.removeEventListener("keydown", h); clearTimeout(timer); };
  }, [router]);

  if (status !== "ready" || !user || !org) return <div className="min-h-screen"><Loading /></div>;

  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const groups = NAV.filter((g) => !g.need || can(user.role, g.need));
  const activeLeaf = groups.flatMap((g) => g.children ?? []).find((l) => isActive(l.href));
  const scope = activeLeaf?.search ?? groups.find((g) => g.href && isActive(g.href))?.search ?? "Ledgerly";

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 flex h-12 items-center bg-navy text-white">
        <Link href="/" className="flex h-full shrink-0 items-center gap-2 px-4 md:w-[220px]">
          <div className="grid size-7 place-items-center rounded-md bg-accent text-sm font-bold text-on-accent">L</div>
          <span className="hidden text-[17px] font-semibold tracking-tight sm:inline">Ledgerly</span>
        </Link>
        <button onClick={() => setPalette(true)} aria-label="Search" className="ml-2 flex h-8 w-8 shrink-0 items-center sm:w-full sm:max-w-sm sm:shrink md:ml-4 gap-2 rounded-md border border-white/15 bg-navy-2 px-3 text-sm text-white/60 hover:border-white/30">
          <Search className="size-4 shrink-0" /><span className="hidden truncate sm:inline">Search in {scope}</span><kbd className="ml-auto hidden border-white/20 bg-transparent text-white/50 sm:inline">/</kbd>
        </button>
        <div className="ml-auto flex items-center gap-3 pr-3 sm:gap-4 sm:pr-4">
          {mode === "demo" && <span className="hidden rounded border border-white/25 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-white/70 sm:inline" title="Sample data. Switch role from the account menu.">Demo</span>}
          <Link href="/settings" className="hidden text-sm text-white/90 hover:text-white lg:block" title="Business settings">{org.name}</Link>
          <QuickCreate role={user.role} />
          <Notifications />
          <ThemeQuickToggle />
          <Link href="/settings" className="hidden text-white/80 hover:text-white sm:block" aria-label="Settings"><Settings className="size-[18px]" /></Link>
          <UserMenu />
        </div>
      </header>

      <div className="flex">
        <aside className="no-print sticky top-12 hidden h-[calc(100vh-3rem)] w-[220px] shrink-0 flex-col overflow-y-auto border-r border-line bg-canvas md:flex">
          <nav className="flex-1 space-y-0.5 px-2.5 py-3 text-[14px]">
            {groups.map((g) => {
              const Icon = g.icon;
              if (g.href) {
                return (
                  <Link key={g.key} href={g.href} className={cx("flex items-center gap-2.5 rounded-md px-3 py-2", isActive(g.href) ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-ink/[0.06]")}>
                    <Icon className="size-4" />{g.label}
                  </Link>
                );
              }
              const hasActive = g.children!.some((c) => isActive(c.href));
              const open = collapsed[g.key] === undefined ? hasActive : !collapsed[g.key];
              return (
                <div key={g.key}>
                  <button onClick={() => setCollapsed((c) => ({ ...c, [g.key]: open }))} className={cx("flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-ink/[0.06]", hasActive ? "text-ink" : "text-ink/85")}>
                    <Icon className="size-4" />{g.label}
                    {open ? <ChevronDown className="ml-auto size-3.5 text-muted" /> : <ChevronRight className="ml-auto size-3.5 text-muted" />}
                  </button>
                  {open && (
                    <ul className="mt-0.5 space-y-0.5">
                      {g.children!.filter((c) => !c.need || can(user.role, c.need)).map((c) => {
                        const active = isActive(c.href);
                        return (
                          <li key={c.href} className={cx("group flex items-center rounded-md", active ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-ink/[0.06]")}>
                            <Link href={c.href} className="flex-1 whitespace-nowrap py-1.5 pl-9 pr-1">{c.label}</Link>
                            {c.newHref && (!c.newNeed || can(user.role, c.newNeed)) && (
                              <Link href={c.newHref} title={`New ${c.label}`} aria-label={`New ${c.label}`} className={cx("mr-1.5 grid size-5 place-items-center rounded focus-visible:opacity-100", active ? "text-accent" : "text-accent opacity-0 group-focus-within:opacity-100 group-hover:opacity-100")}><Plus className="size-4" /></Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>
          <Link href="/settings" className={cx("m-2.5 flex items-center justify-between rounded-md px-3 py-2 text-sm", isActive("/settings") ? "bg-accent-soft font-medium text-accent" : "bg-ink/[0.06] text-ink/85 hover:bg-ink/10")}>
            Settings <ChevronRight className="size-4" />
          </Link>
        </aside>

        <div className="min-w-0 flex-1">
          <main className="pb-16 md:pb-0">
            <Suspense fallback={<Loading />}>{children}</Suspense>
          </main>
        </div>
      </div>
      <MobileTabBar isActive={isActive} onMore={() => setPalette(true)} role={user.role} />
      <ShortcutsHelp />
      {palette && <CommandPalette onClose={() => setPalette(false)} role={user.role} scope={scope} />}
    </div>
  );
}
