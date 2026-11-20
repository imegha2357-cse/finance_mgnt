// Chart of accounts. Every module posts double-entry journal lines against these codes,
// so reports are always computed from one ledger.

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
}

export const ACCOUNTS: Account[] = [
  { code: "1000", name: "Bank", type: "asset" },
  { code: "1100", name: "Accounts receivable", type: "asset" },
  { code: "1200", name: "Input GST", type: "asset" },
  { code: "2000", name: "Accounts payable", type: "liability" },
  { code: "2100", name: "Output GST", type: "liability" },
  { code: "2200", name: "Reimbursements payable", type: "liability" },
  { code: "3000", name: "Owner's equity", type: "equity" },
  { code: "4000", name: "Sales", type: "income" },
  { code: "4100", name: "Other income", type: "income" },
  { code: "5000", name: "Salaries and wages", type: "expense" },
  { code: "5100", name: "Rent", type: "expense" },
  { code: "5200", name: "Software and subscriptions", type: "expense" },
  { code: "5300", name: "Travel", type: "expense" },
  { code: "5400", name: "Marketing", type: "expense" },
  { code: "5500", name: "Office supplies", type: "expense" },
  { code: "5600", name: "Utilities", type: "expense" },
  { code: "5700", name: "Professional fees", type: "expense" },
  { code: "5800", name: "Cost of goods", type: "expense" },
  { code: "5900", name: "Other expenses", type: "expense" },
];

export const BANK = "1000";
export const AR = "1100";
export const INPUT_GST = "1200";
export const AP = "2000";
export const OUTPUT_GST = "2100";
export const REIMB = "2200";
export const EQUITY = "3000";
export const SALES = "4000";

export const accountName = (code: string) => ACCOUNTS.find((a) => a.code === code)?.name ?? code;
export const accountType = (code: string) => ACCOUNTS.find((a) => a.code === code)?.type;
export const EXPENSE_ACCOUNTS = ACCOUNTS.filter((a) => a.type === "expense");
export const INCOME_ACCOUNTS = ACCOUNTS.filter((a) => a.type === "income");

// Keyword rules used to auto-categorise bank lines. They are a simple, explainable
// stand-in for the ML categoriser described in the research doc.
const RULES: { match: RegExp; account: string }[] = [
  { match: /salary|payroll|wages/i, account: "5000" },
  { match: /rent|lease/i, account: "5100" },
  { match: /aws|google workspace|zoho|slack|notion|figma|github|microsoft|adobe|subscription|saas/i, account: "5200" },
  { match: /uber|ola|indigo|air india|vistara|makemytrip|hotel|irctc|flight|cab/i, account: "5300" },
  { match: /google ads|meta ads|facebook|linkedin ads|marketing|ads/i, account: "5400" },
  { match: /amazon|stationery|office|flipkart/i, account: "5500" },
  { match: /electricity|bescom|internet|airtel|jio|broadband|water/i, account: "5600" },
  { match: /ca fees|legal|consult|audit|professional/i, account: "5700" },
];

export function suggestAccount(description: string, direction: "in" | "out"): { account: string; reason: string } {
  if (direction === "in") return { account: "4100", reason: "Money in without an invoice defaults to Other income" };
  for (const r of RULES) {
    const m = description.match(r.match);
    if (m) return { account: r.account, reason: `Matched "${m[0]}" → ${accountName(r.account)}` };
  }
  return { account: "5900", reason: "No rule matched; review the category" };
}
