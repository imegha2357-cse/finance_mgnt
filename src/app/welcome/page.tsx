import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BadgeIndianRupee, Banknote, CalendarClock, CheckCheck, FileCheck2, Landmark, Lock, MessageCircle, QrCode, ShieldCheck, Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Ledgerly · GST-ready books for Indian businesses",
  description: "GST invoices with UPI QR, TDS and MSME payment alerts, bank reconciliation and GSTR-1 export. Built for Indian SMEs and their CAs.",
};

const FEATURES = [
  { icon: FileCheck2, title: "GST 2.0 invoices", text: "5%, 18% and 40% slabs, CGST+SGST or IGST from the place of supply, amount in words, round-off and FY-wise numbering with no gaps." },
  { icon: QrCode, title: "UPI QR on every invoice", text: "Customers scan and pay with GPay, PhonePe, Paytm or any bank app. The amount is already filled in, and it costs you nothing." },
  { icon: MessageCircle, title: "Send on WhatsApp", text: "One tap shares the invoice details and how to pay, and sends polite reminders when payments are late." },
  { icon: BadgeIndianRupee, title: "TDS done right", text: "Pick the Section 393 category on a bill. TDS is worked out on the value before GST, the vendor is paid the net amount, and the 7th-of-month deposit is tracked." },
  { icon: CalendarClock, title: "MSME 45-day rule", text: "Mark Udyam-registered vendors and Ledgerly warns you before the Sec 43B(h) deadline, so the expense stays deductible." },
  { icon: Landmark, title: "Bank reconciliation", text: "Import your bank statement CSV, match lines to entries, and book the rest with suggested categories." },
  { icon: Users, title: "Made for your CA", text: "A read-only CA login, GSTR-1 JSON for the GST portal, Tally-ready journal export, and a lock date so filed months never change." },
  { icon: CheckCheck, title: "Maker-checker approvals", text: "Bills need approval from someone other than the person who entered them, and large bills need the owner too." },
];

const TRUST = [
  { icon: ShieldCheck, title: "Every change is recorded", text: "An audit log of who did what and when, plus role-based access for owner, finance, approver, employee and CA." },
  { icon: Lock, title: "Filed periods are locked", text: "After GSTR-1 and 3B are filed, lock the period so no one can back-date or edit entries." },
  { icon: Banknote, title: "Your data, your copy", text: "Download everything as one file at any time. Personal data is handled as set out in our privacy notice under the DPDP Act, 2023." },
];

export default function Welcome() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
        <div className="grid size-8 place-items-center rounded-md bg-accent font-bold text-on-accent">L</div>
        <span className="text-lg font-semibold tracking-tight">Ledgerly</span>
        <nav className="ml-auto flex items-center gap-2 text-sm">
          <a href="#features" className="hidden px-3 py-2 text-muted hover:text-ink sm:inline">Features</a>
          <a href="#trust" className="hidden px-3 py-2 text-muted hover:text-ink sm:inline">Security</a>
          <Link href="/login" className="rounded-md px-3 py-2 font-medium hover:bg-hover">Sign in</Link>
          <Link href="/login" className="rounded-md bg-accent px-3.5 py-2 font-medium text-on-accent hover:bg-accent-hover">Try the demo</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pt-16">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-in" />Updated for GST 2.0 and the Income Tax Act, 2025
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-5xl">
            GST-ready books for Indian businesses, from invoice to filing.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            Send GST invoices with a UPI QR code, get paid on WhatsApp, deduct TDS correctly, never miss an MSME payment deadline, and hand your CA a clean GSTR-1. Works on your phone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-medium text-on-accent hover:bg-accent-hover">
              Explore the demo <ArrowRight className="size-4" />
            </Link>
            <a href="#features" className="inline-flex h-11 items-center rounded-md border border-line px-5 font-medium hover:bg-hover">See what it does</a>
          </div>
          <p className="mt-4 text-sm text-muted">The demo uses sample data for &ldquo;Demo Traders Pvt Ltd&rdquo;, Bengaluru. No sign-up needed.</p>
        </section>

        <section id="features" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Everything a growing Indian business needs</h2>
            <p className="mt-2 max-w-2xl text-muted">Built around how SMEs actually work: UPI, WhatsApp, cheques and NEFT, a part-time CA, and GST every month.</p>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.title}>
                  <div className="grid size-10 place-items-center rounded-lg bg-accent-soft text-accent"><f.icon className="size-5" /></div>
                  <h3 className="mt-4 font-medium">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="trust" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Built so your CA can trust the numbers</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="rounded-xl border border-line bg-surface p-5">
                <t.icon className="size-5 text-accent" />
                <h3 className="mt-3 font-medium">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-8 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold">See it with real-looking books</h2>
              <p className="mt-1 text-muted">Twelve months of invoices, bills, TDS and bank lines are ready to explore. Pick a role and look around.</p>
            </div>
            <Link href="/login" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-accent px-5 font-medium text-on-accent hover:bg-accent-hover sm:ml-auto">
              Open the demo <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-6 text-sm text-muted">
          <span>© Ledgerly</span>
          <Link href="/privacy" className="hover:text-ink">Privacy notice</Link>
          <span className="ml-auto">Made for India · ₹ · GST · UPI</span>
        </div>
      </footer>
    </div>
  );
}
