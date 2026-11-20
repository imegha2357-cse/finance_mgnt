import "server-only";
import { getStore, newId } from "./store";
import {
  createBill, createCreditNote, createInvoice, createParty, createTransaction, decideBill, openingEntry, payBill,
  recordInvoicePayment, reimburseClaim, saveItem, saveRecurring, updateTransaction,
} from "./services";
import { addDays, today } from "../format";
import type { BankLine, Member, Org, Party, Role, SessionUser, Transaction } from "../types";

export const DEMO_ORG_ID = "demo";

const DEMO_MEMBERS: { role: Role; name: string }[] = [
  { role: "admin", name: "Aarav Mehta" },
  { role: "finance", name: "Priya Nair" },
  { role: "approver", name: "Rohan Desai" },
  { role: "employee", name: "Sneha Iyer" },
  { role: "accountant", name: "CA Vikram Rao" },
];

// Small deterministic PRNG so the demo data is the same on every boot.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A date `monthsAgo` months before the current Indian month, on `day`. */
const dayOf = (monthsAgo: number, day: number) => {
  const t = today();
  return new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 - monthsAgo, day)).toISOString().slice(0, 10);
};

let seeding: Promise<void> | null = null;

/** Creates the demo organisation, its five role-based users and a year of sample activity (once per process). */
export function ensureDemoOrg(): Promise<void> {
  seeding ??= (async () => {
    const store = getStore();
    if (await store.getOrg(DEMO_ORG_ID)) return;
    const org: Org = {
      id: DEMO_ORG_ID, name: "Demo Traders Pvt Ltd", gstin: "29ABCDE1234F1Z5", stateCode: "29",
      address: "4th Floor, 80 Feet Road, Indiranagar, Bengaluru 560038", approvalThreshold: 100000,
      invoicePrefix: "DT/{FY}/", nextInvoiceNumber: 1, sequences: {}, createdAt: new Date().toISOString(),
    };
    await store.saveOrg(org);
    for (const m of DEMO_MEMBERS) {
      const member: Member = { id: `demo-${m.role}`, orgId: DEMO_ORG_ID, name: m.name, email: `${m.role}@demo.ledgerly.in`, role: m.role, createdAt: org.createdAt };
      await store.saveMember(member);
    }
    await seedOrgData(DEMO_ORG_ID, { admin: "demo-admin", finance: "demo-finance", approver: "demo-approver", employee: "demo-employee" });
  })();
  return seeding;
}

/** Fills an organisation with 12 months of realistic activity. Used for the demo org and optionally for new Firebase orgs. */
export async function seedOrgData(orgId: string, uids: { admin: string; finance: string; approver?: string; employee?: string }) {
  const sys = (role: Role, uid: string, name: string): SessionUser => ({ uid, name, email: "", role, orgId });
  const system = sys("admin", "system", "System");
  const finance = sys("finance", uids.finance, "Priya Nair");
  const admin = sys("admin", uids.admin, "Aarav Mehta");
  const approver = uids.approver ? sys("approver", uids.approver, "Rohan Desai") : admin;
  const employee = uids.employee ? sys("employee", uids.employee, "Sneha Iyer") : null;
  // When one person seeds their own org they are both maker and checker, so approvals use a system approver.
  const checker = approver.uid === finance.uid ? sys("admin", "seed-approver", "Seed approver") : approver;
  const finalChecker = admin.uid === finance.uid ? sys("admin", "seed-admin", "Seed admin") : admin;
  const r = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const between = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) / 10) * 10;
  const now = today();
  const yesterday = addDays(now, -1);
  const capDate = (d: string) => (d > yesterday ? yesterday : d);

  await getStore().put(orgId, "journal", openingEntry(dayOf(12, 1), 2500000));

  const vendors: Party[] = [];
  for (const v of [
    { name: "Prestige Office Spaces", gstin: "29AAACP1234Q1Z2", email: "accounts@prestige.example", phone: "+919800000001" },
    { name: "Amazon Web Services India", gstin: "27AAJCA5678R1Z9", email: "billing@aws.example" },
    { name: "Bluechip CA Associates", gstin: "29AABFB4321C1Z7", email: "office@bluechipca.example" },
    { name: "Swift Logistics", gstin: "33AAGCS9876L1Z4", phone: "+919800000004" },
    { name: "Infini Office Supplies", gstin: "29AAFCI2468M1Z3" },
    { name: "Ravi Electricals", stateCode: "29", phone: "+919800000006" }, // unregistered: no input GST credit
  ]) vendors.push(await createParty(system, { type: "vendor", ...v }));
  const customers: Party[] = [];
  for (const c of [
    { name: "Nimbus Retail Pvt Ltd", gstin: "27AADCN1357P1Z8", phone: "+919811111111" },
    { name: "Kaveri Foods", gstin: "29AAHFK2468K1Z1", phone: "+919822222222" },
    { name: "Orbit Tech Solutions", gstin: "36AAICO1122T1Z6", phone: "+919833333333" },
    { name: "Sahyadri Exports", gstin: "24AAKCS3344E1Z5", phone: "+919844444444" },
    { name: "Meera Boutique", stateCode: "29", phone: "+919855555555" }, // B2C
  ]) customers.push(await createParty(system, { type: "customer", ...c, email: `accounts@${c.name.split(" ")[0].toLowerCase()}.example` }));
  const [landlord, aws, ca, logistics, supplies, electrician] = vendors;

  const items = [
    await saveItem(system, { name: "Wholesale goods supply", hsn: "8471", rate: 65000, gstRate: 18, kind: "goods" }),
    await saveItem(system, { name: "Freight and handling", hsn: "9965", rate: 4500, gstRate: 5, kind: "service" }),
    await saveItem(system, { name: "Annual maintenance contract", hsn: "9987", rate: 25000, gstRate: 18, kind: "service" }),
    await saveItem(system, { name: "Installation charges", hsn: "9954", rate: 8000, gstRate: 18, kind: "service" }),
  ];

  const cardSpends = [
    "Uber trip to client office", "IndiGo flight BLR-BOM", "Google Ads campaign", "Airtel broadband", "Amazon stationery order",
    "Slack subscription", "Figma subscription", "Team lunch", "BESCOM electricity", "Hotel stay Mumbai",
  ];
  const bankTxns: Transaction[] = [];

  for (let m = 11; m >= 0; m--) {
    const current = m === 0;
    const safe = (d: string) => (current ? capDate(d) : d);

    bankTxns.push(await createTransaction(finance, { date: safe(dayOf(m, 1)), description: "Salary payout - monthly payroll", amount: between(560000, 640000), direction: "out", source: "bank", receipt: true }));

    const rent = await createBill(finance, { vendorId: landlord.id, billNumber: `PO-RENT-${dayOf(m, 1).slice(0, 7)}`, billDate: dayOf(m, 1), dueDate: dayOf(m, 5), account: "5100", items: [{ description: "Office rent", qty: 1, rate: 125000, gstRate: 18 }] });
    await decideBill(checker, rent.id, "approved");
    if (rent.approvalsRequired > 1) await decideBill(finalChecker, rent.id, "approved");
    await payBill(finance, rent.id, { date: safe(dayOf(m, 5)), mode: "Bank transfer (NEFT/RTGS/IMPS)" });

    const cloud = await createBill(finance, { vendorId: aws.id, billNumber: `AWS-${dayOf(m, 2).slice(0, 7)}`, billDate: dayOf(m, 2), dueDate: dayOf(m, 12), account: "5200", items: [{ description: "Cloud hosting", qty: 1, rate: between(38000, 52000), gstRate: 18 }] });
    if (!current) {
      await decideBill(checker, cloud.id, "approved");
      await payBill(finance, cloud.id, { date: dayOf(m, 12), mode: "Card" });
    }

    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const missing = m <= 1 && r() < 0.45;
      bankTxns.push(await createTransaction(finance, { date: safe(dayOf(m, 3 + Math.floor(r() * 24))), description: pick(cardSpends), amount: between(800, 26000), direction: "out", source: "card", receipt: !missing }));
    }

    // Sales invoices: 2–4 a month; older ones paid (some in two instalments), recent ones open.
    const k = 2 + Math.floor(r() * 3);
    for (let i = 0; i < k; i++) {
      const cust = pick(customers);
      const issue = safe(dayOf(m, 4 + i * 6));
      const goods = items[0], freight = items[1];
      const inv = await createInvoice(finance, {
        customerId: cust.id, issueDate: issue, dueDate: addDays(issue, 30), send: true,
        items: [
          { description: goods.name, hsn: goods.hsn, qty: 1 + Math.floor(r() * 8), rate: between(40000, 90000), gstRate: goods.gstRate },
          { description: freight.name, hsn: freight.hsn, qty: 1, rate: between(2000, 8000), gstRate: freight.gstRate },
        ],
      });
      if (m >= 2 || (m === 1 && r() < 0.4)) {
        const paidOn = capDate(addDays(issue, 18 + Math.floor(r() * 25)));
        const mode = r() < 0.5 ? "UPI" : "Bank transfer (NEFT/RTGS/IMPS)";
        if (r() < 0.25) {
          const half = Math.round(inv.total / 2);
          await recordInvoicePayment(finance, inv.id, { amount: half, date: capDate(addDays(issue, 10)), mode, reference: `UTR${Math.floor(r() * 1e10)}` });
          await recordInvoicePayment(finance, inv.id, { date: paidOn, mode, reference: `UTR${Math.floor(r() * 1e10)}` });
        } else {
          await recordInvoicePayment(finance, inv.id, { date: paidOn, mode, reference: `UTR${Math.floor(r() * 1e10)}` });
        }
      }
    }

    if (!current) {
      const cogs = await createBill(finance, { vendorId: logistics.id, billNumber: `SL/${1000 + 11 - m}`, billDate: dayOf(m, 15), dueDate: dayOf(m, 28), account: "5800", items: [{ description: "Inbound freight", qty: 1, rate: between(60000, 95000), gstRate: 12 }] });
      await decideBill(checker, cogs.id, "approved");
      if (cogs.approvalsRequired > 1) await decideBill(finalChecker, cogs.id, "approved");
      await payBill(finance, cogs.id, { date: dayOf(m, 27), mode: "Bank transfer (NEFT/RTGS/IMPS)" });
    }
    if (m % 3 === 0 && !current) {
      const fee = await createBill(finance, { vendorId: ca.id, billNumber: `BCA-${dayOf(m, 10).slice(0, 7)}`, billDate: dayOf(m, 10), dueDate: dayOf(m, 20), account: "5700", items: [{ description: "Quarterly accounting and GST filing", qty: 1, rate: 45000, gstRate: 18 }] });
      await decideBill(checker, fee.id, "approved");
      await payBill(finance, fee.id, { date: dayOf(m, 20), mode: "Bank transfer (NEFT/RTGS/IMPS)" });
    }
  }

  // Unregistered vendor: tax becomes part of the cost, no input credit.
  const repair = await createBill(finance, { vendorId: electrician.id, billNumber: "RE-118", billDate: addDays(now, -20), dueDate: addDays(now, -5), account: "5900", items: [{ description: "Electrical repairs", qty: 1, rate: 12000, gstRate: 18 }] });
  await decideBill(checker, repair.id, "approved");
  await payBill(finance, repair.id, { date: addDays(now, -6), mode: "UPI", amount: 7000 }); // partly paid

  // Open items for the inbox.
  await createBill(finance, { vendorId: supplies.id, billNumber: "IOS/7781", billDate: addDays(now, -3), dueDate: addDays(now, 10), account: "5500", items: [{ description: "Ergonomic chairs", qty: 6, rate: 14500, gstRate: 18 }] });
  await createBill(finance, { vendorId: logistics.id, billNumber: "SL/2042", billDate: addDays(now, -2), dueDate: addDays(now, 14), account: "5800", items: [{ description: "Bulk inbound freight, festive season", qty: 1, rate: 240000, gstRate: 12 }] });
  const half = await createBill(finance, { vendorId: ca.id, billNumber: "BCA-AUDIT", billDate: addDays(now, -6), dueDate: addDays(now, 4), account: "5700", items: [{ description: "Statutory audit fees", qty: 1, rate: 150000, gstRate: 18 }] });
  await decideBill(checker, half.id, "approved"); // waits for the admin's final approval
  const due = await createBill(finance, { vendorId: supplies.id, billNumber: "IOS/7702", billDate: addDays(now, -12), dueDate: addDays(now, 2), account: "5500", items: [{ description: "Printer cartridges and paper", qty: 1, rate: 18500, gstRate: 18 }] });
  await decideBill(checker, due.id, "approved");
  await createInvoice(finance, { customerId: customers[1].id, issueDate: now, dueDate: addDays(now, 15), send: false, items: [{ description: items[0].name, hsn: items[0].hsn, qty: 2, rate: 30000, gstRate: 18 }] });

  // A credit note on an open invoice (goods returned).
  const forCredit = await createInvoice(finance, { customerId: customers[4].id, issueDate: addDays(now, -9), dueDate: addDays(now, 6), send: true, items: [{ description: items[2].name, hsn: items[2].hsn, qty: 2, rate: 25000, gstRate: 18 }] });
  await createCreditNote(finance, { invoiceId: forCredit.id, date: addDays(now, -4), reason: "One AMC cancelled before start", items: [{ description: items[2].name, hsn: items[2].hsn, qty: 1, rate: 25000, gstRate: 18 }] });

  // Recurring monthly AMC billing.
  await saveRecurring(system, {
    name: "Kaveri Foods – monthly AMC", customerId: customers[1].id, frequency: "monthly", paymentTermsDays: 15,
    nextDate: dayOf(-1, 1), autoSend: true, active: true,
    items: [{ description: items[2].name, hsn: items[2].hsn, qty: 1, rate: items[2].rate, gstRate: items[2].gstRate }],
  });

  if (employee) {
    await createTransaction(employee, { date: addDays(now, -1), description: "Ola cab to vendor meeting", amount: 640, direction: "out", source: "claim", receipt: true });
    await createTransaction(employee, { date: addDays(now, -2), description: "Client lunch", amount: 2350, direction: "out", source: "claim", receipt: false });
    const approved = await createTransaction(employee, { date: addDays(now, -15), description: "Train tickets to Mysuru client", amount: 1820, direction: "out", source: "claim", receipt: true, partyName: "Sneha Iyer" });
    await updateTransaction(finance, approved.id, { status: "posted" }); // approved, waiting to be reimbursed
    const older = await createTransaction(employee, { date: addDays(now, -40), description: "Courier charges", amount: 450, direction: "out", source: "claim", receipt: true, partyName: "Sneha Iyer" });
    await updateTransaction(finance, older.id, { status: "posted" });
    await reimburseClaim(finance, older.id, { date: addDays(now, -35) });
  }

  // A bank statement for the last few weeks: most lines match booked transactions, a few are new.
  const importId = newId();
  const recentBank = bankTxns.filter((t) => t.date >= addDays(now, -25));
  const lines: BankLine[] = recentBank.map((t) => ({
    id: newId(), date: t.date, description: t.description.toUpperCase().slice(0, 40), amount: t.amount, direction: t.direction, importId, createdAt: new Date().toISOString(),
  }));
  lines.push(
    { id: newId(), date: addDays(now, -3), description: "BANK CHARGES - SMS ALERTS Q3", amount: 177, direction: "out", importId, createdAt: new Date().toISOString() },
    { id: newId(), date: addDays(now, -2), description: "INT CREDIT SAVINGS SWEEP", amount: 1840.5, direction: "in", importId, createdAt: new Date().toISOString() },
    { id: newId(), date: addDays(now, -1), description: "NEFT-ZOMATO MEDIA PVT LTD-ADS", amount: 5900, direction: "out", importId, createdAt: new Date().toISOString() },
  );
  // Pre-match half of the matching lines so the reconciliation screen shows both states.
  const store = getStore();
  for (const [i, l] of lines.entries()) {
    const t = recentBank[i];
    if (t && i % 2 === 0) {
      l.matchedTxnId = t.id;
      await store.put(orgId, "transactions", { ...(await store.get<Transaction>(orgId, "transactions", t.id))!, bankLineId: l.id });
    }
    await store.put(orgId, "bank_lines", l);
  }
}
