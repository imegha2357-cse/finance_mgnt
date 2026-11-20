import type { LineItem, TaxBreakup } from "./types";

export const GST_RATES = [0, 5, 12, 18, 28];

export const STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidGstin(gstin: string) {
  return GSTIN_RE.test(gstin.trim().toUpperCase()) && gstin.slice(0, 2) in STATES;
}

export const stateFromGstin = (gstin?: string) => (gstin && gstin.length >= 2 ? gstin.slice(0, 2) : "");

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Intra-state supply (supplier state = place of supply) → CGST + SGST, each half the rate.
 * Inter-state supply → IGST at the full rate.
 */
export function computeTax(items: LineItem[], supplierState: string, placeOfSupply: string): TaxBreakup {
  const intra = supplierState === placeOfSupply;
  let subtotal = 0, cgst = 0, sgst = 0, igst = 0;
  for (const it of items) {
    const base = round2(it.qty * it.rate);
    const tax = round2((base * it.gstRate) / 100);
    subtotal += base;
    if (intra) {
      cgst += round2(tax / 2);
      sgst += round2(tax / 2);
    } else {
      igst += tax;
    }
  }
  subtotal = round2(subtotal);
  cgst = round2(cgst);
  sgst = round2(sgst);
  igst = round2(igst);
  return { subtotal, cgst, sgst, igst, total: round2(subtotal + cgst + sgst + igst) };
}

/** Next statutory monthly due dates (TDS deposit: 7th, GSTR-1: 11th, GSTR-3B: 20th) on or after `todayIso` (YYYY-MM-DD, India time). */
export function upcomingComplianceDates(todayIso: string) {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7)) - 1;
  const make = (day: number, label: string, detail: string) => {
    let d = new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
    if (d < todayIso) d = new Date(Date.UTC(y, m + 1, day)).toISOString().slice(0, 10);
    return { label, detail, date: d };
  };
  return [
    make(7, "TDS deposit", "TDS deducted last month is due to the government"),
    make(11, "GSTR-1", "Outward supplies return for last month"),
    make(20, "GSTR-3B", "Summary return and GST payment for last month"),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
