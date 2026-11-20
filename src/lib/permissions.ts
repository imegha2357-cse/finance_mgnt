import type { Role } from "./types";

export type Action =
  | "txn:create"
  | "txn:edit"
  | "bill:create"
  | "bill:approve"
  | "bill:pay"
  | "invoice:create"
  | "invoice:update"
  | "party:write"
  | "reports:read"
  | "books:read"
  | "org:manage";

const MATRIX: Record<Role, Action[]> = {
  admin: ["txn:create", "txn:edit", "bill:create", "bill:approve", "bill:pay", "invoice:create", "invoice:update", "party:write", "reports:read", "books:read", "org:manage"],
  finance: ["txn:create", "txn:edit", "bill:create", "bill:pay", "invoice:create", "invoice:update", "party:write", "reports:read", "books:read"],
  approver: ["bill:approve", "reports:read", "books:read"],
  accountant: ["reports:read", "books:read"],
  employee: ["txn:create"],
};

export const can = (role: Role, action: Action) => MATRIX[role].includes(action);
