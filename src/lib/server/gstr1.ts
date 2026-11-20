import "server-only";
import { round2 } from "../gst";
import type { CreditNote, Invoice, LineItem, Party } from "../types";
import { getOrg, listCreditNotes, listInvoices, listParties } from "./services";

/**
 * GSTR-1 for one tax period in the JSON layout used by the GST portal's offline tool:
 * B2B, B2CL (inter-state B2C invoices above ₹1 lakh), B2CS, CDNR (credit notes to registered customers)
 * and the HSN summary split into B2B and B2C. It is a starting point for the CA to review before upload.
 */
const B2CL_LIMIT = 100000;
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

type Amt = { txval: number; iamt: number; camt: number; samt: number };
function lineTax(it: LineItem, intra: boolean): Amt {
  const txval = round2(it.qty * it.rate);
  const tax = round2((txval * it.gstRate) / 100);
  return intra ? { txval, iamt: 0, camt: round2(tax / 2), samt: round2(tax / 2) } : { txval, iamt: tax, camt: 0, samt: 0 };
}
const add = (a: Amt, b: Amt): Amt => ({ txval: round2(a.txval + b.txval), iamt: round2(a.iamt + b.iamt), camt: round2(a.camt + b.camt), samt: round2(a.samt + b.samt) });
const zero = (): Amt => ({ txval: 0, iamt: 0, camt: 0, samt: 0 });

/** One `itms` entry per GST rate, as the portal expects. */
function itemsByRate(items: LineItem[], intra: boolean, withSgst = true) {
  const byRate = new Map<number, Amt>();
  for (const it of items) byRate.set(it.gstRate, add(byRate.get(it.gstRate) ?? zero(), lineTax(it, intra)));
  return [...byRate.entries()].map(([rt, a], i) => ({
    num: i + 1,
    itm_det: withSgst ? { txval: a.txval, rt, iamt: a.iamt, camt: a.camt, samt: a.samt, csamt: 0 } : { txval: a.txval, rt, iamt: a.iamt, csamt: 0 },
  }));
}

export async function gstr1(orgId: string, month: string) {
  const org = await getOrg(orgId);
  const parties = new Map((await listParties(orgId)).map((p) => [p.id, p] as [string, Party]));
  const invoices = (await listInvoices(orgId)).filter((i) => (i.status === "sent" || i.status === "paid") && i.issueDate.startsWith(month));
  const notes = (await listCreditNotes(orgId)).filter((c) => c.date.startsWith(month));
  const allInvoices = new Map((await listInvoices(orgId)).map((i) => [i.id, i] as [string, Invoice]));
  const intraOf = (pos: string) => pos === org.stateCode;

  const b2b = new Map<string, unknown[]>();
  const b2cl = new Map<string, unknown[]>();
  const b2cs = new Map<string, Amt & { sply_ty: string; pos: string; rt: number }>();
  const hsn = { b2b: new Map<string, Amt & { hsn_sc: string; desc: string; qty: number; rt: number; num?: number }>(), b2c: new Map<string, Amt & { hsn_sc: string; desc: string; qty: number; rt: number }>() };

  const addHsn = (kind: "b2b" | "b2c", it: LineItem, intra: boolean, sign = 1) => {
    const key = `${it.hsn || "NA"}|${it.gstRate}`;
    const t = lineTax(it, intra);
    const cur = hsn[kind].get(key) ?? { hsn_sc: it.hsn || "", desc: it.description.slice(0, 30), qty: 0, rt: it.gstRate, ...zero() };
    hsn[kind].set(key, { ...cur, qty: round2(cur.qty + sign * it.qty), txval: round2(cur.txval + sign * t.txval), iamt: round2(cur.iamt + sign * t.iamt), camt: round2(cur.camt + sign * t.camt), samt: round2(cur.samt + sign * t.samt) });
  };

  for (const inv of invoices) {
    const intra = intraOf(inv.placeOfSupply);
    const gstin = inv.customerGstin || parties.get(inv.customerId)?.gstin;
    if (gstin) {
      const list = b2b.get(gstin) ?? [];
      list.push({ inum: inv.number, idt: ddmmyyyy(inv.issueDate), val: inv.total, pos: inv.placeOfSupply, rchrg: "N", inv_typ: "R", itms: itemsByRate(inv.items, intra) });
      b2b.set(gstin, list);
      inv.items.forEach((it) => addHsn("b2b", it, intra));
    } else if (!intra && inv.total > B2CL_LIMIT) {
      const list = b2cl.get(inv.placeOfSupply) ?? [];
      list.push({ inum: inv.number, idt: ddmmyyyy(inv.issueDate), val: inv.total, itms: itemsByRate(inv.items, intra, false) });
      b2cl.set(inv.placeOfSupply, list);
      inv.items.forEach((it) => addHsn("b2c", it, intra));
    } else {
      for (const it of inv.items) {
        const key = `${inv.placeOfSupply}|${it.gstRate}`;
        const cur = b2cs.get(key) ?? { sply_ty: intra ? "INTRA" : "INTER", pos: inv.placeOfSupply, rt: it.gstRate, ...zero() };
        b2cs.set(key, { ...cur, ...add(cur, lineTax(it, intra)) });
        addHsn("b2c", it, intra);
      }
    }
  }

  const cdnr = new Map<string, unknown[]>();
  const cdnurSkipped: string[] = [];
  for (const cn of notes as CreditNote[]) {
    const inv = allInvoices.get(cn.invoiceId);
    if (!inv) continue;
    const intra = intraOf(inv.placeOfSupply);
    const gstin = inv.customerGstin;
    if (!gstin) { cdnurSkipped.push(cn.number); continue; }
    const list = cdnr.get(gstin) ?? [];
    list.push({ ntty: "C", nt_num: cn.number, nt_dt: ddmmyyyy(cn.date), pos: inv.placeOfSupply, rchrg: "N", inv_typ: "R", val: cn.total, itms: itemsByRate(cn.items, intra) });
    cdnr.set(gstin, list);
    cn.items.forEach((it) => addHsn("b2b", it, intra, -1));
  }

  const hsnRows = (m: typeof hsn.b2b) => [...m.values()].map((h, i) => ({ num: i + 1, hsn_sc: h.hsn_sc, desc: h.desc, uqc: "NOS", qty: h.qty, rt: h.rt, txval: h.txval, iamt: h.iamt, camt: h.camt, samt: h.samt, csamt: 0 }));
  return {
    gstin: org.gstin,
    fp: `${month.slice(5, 7)}${month.slice(0, 4)}`,
    b2b: [...b2b.entries()].map(([ctin, inv]) => ({ ctin, inv })),
    b2cl: [...b2cl.entries()].map(([pos, inv]) => ({ pos, inv })),
    b2cs: [...b2cs.values()].map((r) => ({ sply_ty: r.sply_ty, pos: r.pos, typ: "OE", txval: r.txval, rt: r.rt, iamt: r.iamt, camt: r.camt, samt: r.samt, csamt: 0 })),
    cdnr: [...cdnr.entries()].map(([ctin, nt]) => ({ ctin, nt })),
    hsn: { hsn_b2b: hsnRows(hsn.b2b), hsn_b2c: hsnRows(hsn.b2c) },
    _ledgerly: {
      note: "Prepared by Ledgerly from your books. Review with your CA and validate in the GST offline tool before uploading.",
      invoices: invoices.length, creditNotes: notes.length,
      ...(cdnurSkipped.length ? { creditNotesToUnregisteredNotIncluded: cdnurSkipped } : {}),
      hsnMissing: invoices.flatMap((i) => i.items.filter((it) => !it.hsn).map(() => i.number)).filter((v, k, a) => a.indexOf(v) === k),
    },
  };
}
