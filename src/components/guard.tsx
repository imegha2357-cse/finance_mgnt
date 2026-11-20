"use client";
import { useAuth } from "./auth-provider";
import { NoAccess } from "./ui";
import { can, type Action } from "@/lib/permissions";

/** Renders children only when the signed-in role may perform `need`. */
export function Guard({ need, what, children }: { need: Action; what?: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  return can(user.role, need) ? <>{children}</> : <NoAccess what={what} />;
}
