import { requireSession } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { HttpError } from "@/lib/server/http";
import { attachReceipt, readReceipt } from "@/lib/server/services";

const MAX = 5 * 1024 * 1024;
const TYPES = /^(image\/(png|jpe?g|webp|heic)|application\/pdf)$/;

/** Upload a receipt (multipart field "file"): Firebase Storage in production, memory in demo mode. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file");
  if (file.size > MAX) throw new HttpError(413, "Receipts must be 5 MB or smaller");
  if (!TYPES.test(file.type)) throw new HttpError(415, "Upload a photo (JPG, PNG, WebP, HEIC) or a PDF");
  const data = Buffer.from(await file.arrayBuffer());
  return ok(await attachReceipt(s, (await params).id, { name: file.name, type: file.type, data }));
});

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req);
  const f = await readReceipt(s, (await params).id);
  return new Response(new Uint8Array(f.data), {
    headers: { "content-type": f.contentType, "content-disposition": `inline; filename="${encodeURIComponent(f.name)}"`, "cache-control": "private, no-store" },
  });
});
