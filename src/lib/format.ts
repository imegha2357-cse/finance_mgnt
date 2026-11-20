const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export const money = (n: number) => inr.format(n);
export const money0 = (n: number) => inr0.format(n);
export const moneyCompact = (n: number) => "₹" + compact.format(n);

export function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: iso.length === 10 ? "UTC" : "Asia/Kolkata" });
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in India (Asia/Kolkata), as YYYY-MM-DD — the same on the server (UTC) and in the browser. */
export const today = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Current month in India, YYYY-MM. */
export const thisMonth = () => today().slice(0, 7);

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number) {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** Indian financial year (1 April – 31 March) containing the given date. */
export function fiscalYear(iso = today()) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return {
    start: `${start}-04-01`,
    end: `${start + 1}-03-31`,
    label: `${String(start).slice(2)}-${String(start + 1).slice(2)}`, // e.g. "26-27"
    months: Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(start, 3 + i, 1)).toISOString().slice(0, 7)),
  };
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
