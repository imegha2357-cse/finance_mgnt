import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { search } from "@/lib/server/services";

export const GET = handle(async (req: NextRequest) => {
  const s = await requireSession(req);
  return ok(await search(s, req.nextUrl.searchParams.get("q") ?? ""));
});
