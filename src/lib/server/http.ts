import "server-only";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Wraps a route handler so thrown HttpErrors and validation errors become clean JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e); // let Next.js internals (e.g. dynamic-rendering bailouts) through
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      if (e instanceof ZodError) {
        const msg = e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
        return NextResponse.json({ error: msg, code: "validation" }, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}
