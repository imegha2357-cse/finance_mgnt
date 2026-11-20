/**
 * TDS on payments to residents under the Income Tax Act, 2025 (in force from 1 April 2026).
 * All non-salary TDS now sits in Section 393; the old 194-series section is shown for familiarity.
 * Rates are the standard rates for Tax Year 2026-27. Thresholds, lower-deduction certificates and
 * missing-PAN rates (20%) are the CA's call – the app shows the rate it applied so it can be checked.
 */
export interface TdsSection { code: string; label: string; old: string; rate: number }

export const TDS_SECTIONS: TdsSection[] = [
  { code: "contract-ind", label: "Contractor – individual / HUF", old: "194C", rate: 1 },
  { code: "contract-oth", label: "Contractor – company / firm", old: "194C", rate: 2 },
  { code: "prof", label: "Professional fees (CA, lawyer, consultant)", old: "194J", rate: 10 },
  { code: "tech", label: "Technical services / royalty for films", old: "194J", rate: 2 },
  { code: "rent-pm", label: "Rent – plant, machinery, equipment", old: "194-I", rate: 2 },
  { code: "rent-lb", label: "Rent – land, building, furniture", old: "194-I", rate: 10 },
  { code: "commission", label: "Commission / brokerage", old: "194H", rate: 2 },
];

export const tdsSection = (code?: string) => TDS_SECTIONS.find((t) => t.code === code);

/** TDS is worked out on the value before GST (when GST is shown separately) and rounded to the rupee. */
export const tdsOn = (subtotal: number, code?: string) => {
  const t = tdsSection(code);
  return t ? Math.round((subtotal * t.rate) / 100) : 0;
};

export const tdsLabel = (code?: string) => {
  const t = tdsSection(code);
  return t ? `Sec 393 (was ${t.old}) · ${t.label} · ${t.rate}%` : "";
};

/**
 * Section 43B(h): payments to micro and small enterprises (Udyam-registered) must be made within 15 days,
 * or within the agreed period up to 45 days if there is a written agreement, or the expense is not deductible
 * in that year. Medium enterprises are not covered.
 */
export function msmeDeadline(billDate: string, dueDate: string, vendor: { msme?: string; msmeAgreement?: boolean }) {
  if (vendor.msme !== "micro" && vendor.msme !== "small") return undefined;
  const add = (iso: string, days: number) => new Date(Date.parse(iso + "T00:00:00Z") + days * 864e5).toISOString().slice(0, 10);
  if (!vendor.msmeAgreement) return add(billDate, 15);
  const cap = add(billDate, 45);
  return dueDate < cap ? dueDate : cap;
}
