import { requireSession } from "@/lib/server/auth";
import { HttpError, handle, ok } from "@/lib/server/http";
import { rolePatchSchema } from "@/lib/server/schemas";
import { audit } from "@/lib/server/services";
import { getStore } from "@/lib/server/store";
import type { Member } from "@/lib/types";

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "org:manage");
  const { id } = await params;
  const { role } = rolePatchSchema.parse(await req.json());
  const m = await getStore().get<Member>(s.orgId, "members", id);
  if (!m) throw new HttpError(404, "Member not found");
  if (m.id === s.uid && role !== "admin") throw new HttpError(400, "You cannot remove your own admin role");
  const admins = (await getStore().list<Member>(s.orgId, "members")).filter((x) => x.role === "admin");
  if (m.role === "admin" && role !== "admin" && admins.length <= 1) throw new HttpError(400, "An organisation needs at least one admin");
  const next = { ...m, role };
  await getStore().saveMember(next);
  await audit(s, "member.role_changed", m.email, `${m.role} → ${role}`);
  return ok(next);
});

export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, "org:manage");
  const { id } = await params;
  if (id === s.uid) throw new HttpError(400, "You cannot remove yourself");
  const members = await getStore().list<Member>(s.orgId, "members");
  const m = members.find((x) => x.id === id);
  if (!m) throw new HttpError(404, "Member not found");
  if (m.role === "admin" && members.filter((x) => x.role === "admin").length <= 1) throw new HttpError(400, "An organisation needs at least one admin");
  await getStore().deleteMember(m);
  await audit(s, "member.removed", m.email, m.role);
  return ok({ ok: true });
});
