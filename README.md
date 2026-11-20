# Ledgerly: business finance for Indian SMEs

Ledgerly is built with **Next.js 16**. Its API routes are the backend, and **Firebase** provides Auth, Firestore and Storage. The layout follows the familiar accounting-app pattern: a dark top bar with search across records ( / ), a quick-create menu and notifications; a grouped sidebar; list pages with a view switcher and "+ New"; and full-page forms with a sticky action bar.

Every money event writes to one **double-entry ledger**, so the reports are live and always balance.

## What it does

| Area | Features |
| --- | --- |
| **Sales** | Customers with detail page and printable statement. GST invoices: drafts, send, edit and delete drafts, void. **Part payments**, **credit notes**, **recurring invoices** (daily cron), WhatsApp and email payment reminders, optional Razorpay payment links with an auto-mark-paid webhook. |
| **Purchases** | Vendors with detail page and statement. Bills with multi-level approval and maker-checker. Edit or delete before approval (editing restarts approval). Duplicate-bill check. **Part payments**. |
| **Items** | Saved goods and services with HSN/SAC, rate and GST. Picking one on an invoice fills the line. |
| **Banking** | Transactions with auto-categorisation, edit and delete. Real receipt upload to Firebase Storage. Employee claims: approve, then reimburse. **Bank statement CSV import and reconciliation** with suggested matches. |
| **Reports** | P&L, balance sheet, **trial balance**, **general ledger**, **receivables and payables ageing**, cash flow, **GST summary (B2B / B2C / credit notes / ITC)**. CSV export of each report, plus the full journal for Tally or Zoho. Print to PDF. |
| **Team** | Five roles (Admin, Finance, Approver, Employee, CA). Invite with a one-time password-setup link, change roles, remove members. Audit log. |
| **India specifics** | CGST + SGST vs IGST from the GSTIN state. GST input credit only from registered vendors. Invoice numbers per financial year (`INV/{FY}/0001` → `INV/26-27/0001`), assigned on send so drafts never leave gaps. All dates in Indian time. GSTR-1 / 3B / TDS due-date reminders. |

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

With **no** Firebase variables set, the app runs in **demo mode**: 12 months of sample data for "Demo Traders Pvt Ltd", and a role picker instead of a login. Use the top-bar "view as" switcher to see how each role's access and approvals differ. Demo data lives in memory and resets when the server restarts.

## Switch to Firebase

1. Create a project at https://console.firebase.google.com.
2. Enable **Authentication** (Email/Password, and Google if you want it), **Firestore** and **Storage**.
3. Deploy the rules: `npx firebase-tools deploy --only firestore:rules`. They deny all direct client access, because only the server touches the data.
4. Copy `.env.example` to `.env.local` and fill in **both** Firebase blocks: the web config (`NEXT_PUBLIC_FIREBASE_*`) and the service account (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
5. `npm run dev`, then sign up. You'll create your organisation (name, GSTIN, address) and become its admin.

> **Safety check:** if only *some* Firebase variables are set, every API call is refused with a "Server misconfigured" message instead of falling back to the open demo.

## Optional integrations

| Integration | Environment variables | What switches on |
| --- | --- | --- |
| Razorpay Payment Links | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Sent invoices get a payment link (UPI, cards, net banking). The webhook `/api/webhooks/razorpay` (`payment_link.paid`) records the payment automatically. |
| Vercel Cron | `CRON_SECRET` | `vercel.json` runs `/api/cron/recurring` daily at 06:00 IST to create due recurring invoices. You can also click "Run due now". |

## Deploy to Vercel

Import the repo in Vercel and add the environment variables under *Project → Settings → Environment Variables*. The cron job in `vercel.json` is picked up automatically.

## Architecture

```
Browser (React client components)
   │  Firebase ID token  (demo mode: x-demo-role header, refused if any Firebase var is set)
   ▼
Next.js API routes  src/app/api/**            ← the backend
   │  verify token → member + role → permission check (src/lib/permissions.ts)
   ▼
Domain services     src/lib/server/services.ts
   │  every money event posts a balanced journal entry in the same atomic batch
   ▼
Store               src/lib/server/store.ts
   ├─ Firestore: orgs/{orgId}/{parties|items|transactions|bills|invoices|credit_notes|recurring|bank_lines|journal|audit|members}
   │             invoice numbers via a Firestore transaction (no duplicates under concurrency)
   ├─ Storage:   receipts/{orgId}/{txnId}/…
   └─ Memory:    demo mode
```

### Accounting rules

- **Bills:** posted on approval as Dr Expense (+ Dr Input GST when the vendor is registered), Cr Accounts payable. Each payment is Dr AP, Cr Bank.
- **Invoices:** posted when sent as Dr AR, Cr Sales, Cr Output GST. Each payment is Dr Bank, Cr AR. A credit note is Dr Sales, Dr Output GST, Cr AR.
- **Employee claims:** approval posts Dr Expense, Cr Reimbursements payable. Reimbursement posts Dr Reimbursements payable, Cr Bank.
- **Bank and card spend:** Dr Expense, Cr Bank. Editing or deleting a transaction re-posts or removes its entry.

## Still needs a partner (not built in)

| Feature | Why |
| --- | --- |
| Live bank feeds | Partner-bank APIs or Account Aggregator; for now, import CSV statements. |
| Sending money for bills and claims | A payout API (e.g. RazorpayX, Cashfree). Payments are recorded, not transferred. |
| e-Invoice IRN / e-way bill / GST filing | A GSP (GST Suvidha Provider) integration. The GST summary exports for your CA. |
| Automatic WhatsApp/email sending | A messaging provider. Reminders currently open WhatsApp or your email app with the text filled in. |

## Design system and UX (v3)

- **Themes:** dark "charcoal" is the default (`#121316` canvas, `#1c1e24` surface, `#8b95ff` accent). There is also an indigo light theme and a "System" option, chosen from the account menu or the sun/moon button in the top bar. All colours live in `src/styles/tokens.css`, so a re-theme or white-label is a one-file change. Invoices always render on white "paper".
- **Numbers:** tabular figures everywhere. The `<Money>` component (`src/components/finance-ui.tsx`) gives each page one hero figure, with Indian digit grouping and a smaller ₹ and paise.
- **Plain language:** `<Term>` underlines accounting words and explains them on hover or focus (Receivables, GST payable, Runway, Accrual…).
- **Keyboard-first:**
  - `/` or `Ctrl+K` to search.
  - `g d|i|c|b|v|t|r|s` to go to a page, `n i|b|e|c|v|p` to create a record.
  - `Ctrl+S` saves a form, `Enter` moves through the item table, `?` lists every shortcut.
- **Dashboard:** "Needs attention" comes first, then cash / GST / runway, then receivables and payables. Shows when the figures were last updated, with a refresh button.
- **WhatsApp:** "Share on WhatsApp" on sent invoices (it becomes "WhatsApp reminder" once overdue or part-paid), prefilled with the amount, due date and Razorpay link.
- **Tables:** sticky headers, a Comfortable/Compact density setting, and 6-month sparklines on the Customers and Vendors lists.
- **States:** skeleton loading, empty states with a first action, and subtle motion that respects `prefers-reduced-motion`.
- **Mobile:** bottom tab bar on phones.

## India compliance (v4)

- **GST 2.0 (from 22 Sep 2025):** the rates offered are 0/5/18/40%, plus 3% (gold) and 0.25% (rough diamonds). 12% and 28% are accepted only on documents dated before 22 Sep 2025, and the server rejects them after that date. See `src/lib/gst.ts`.
- **TDS under the Income Tax Act, 2025 (Section 393):** pick the category on a bill. TDS is worked out on the value before GST and rounded to the rupee, and is posted to *2300 TDS payable*. The vendor is paid the net amount. Record the challan as a transaction to "TDS deposit". See `src/lib/tds.ts`.
- **MSME Sec 43B(h):** vendors carry their Udyam type and whether there is a written agreement. Bills get a pay-by date (15 days, or up to 45 with an agreement), with alerts in "Needs attention".
- **Invoices:** UPI QR (scan-to-pay, amount filled in), bank details, round-off to the rupee (*4200 Round off*), "Original for recipient", PAN and authorised signatory.
- **GSTR-1 JSON** (`/api/reports/gstr1?month=YYYY-MM`) in the offline-tool layout: B2B, B2CL, B2CS, CDNR and HSN split into B2B/B2C. Review it with your CA before uploading.
- **Period lock:** Settings → "Locked up to". Every create, edit, delete or payment dated on or before that day is refused (HTTP 423).
- **DPDP:** a `/privacy` notice template (fill in the bracketed details) and admin "Download all data" (`/api/export`).
- **Public homepage** at `/welcome`. Signed-out visitors to `/` land there.
