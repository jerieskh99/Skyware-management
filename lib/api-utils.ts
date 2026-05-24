import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/permissions";

export type AuthResult =
  | { user: SessionUser; error?: never }
  | { user?: never; error: NextResponse };

/** Validate session and return typed SessionUser or a 401 response. */
export async function requireAuth(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user: session.user as SessionUser };
}

/** Standard 403. */
export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** Standard 400 with Zod errors. */
export function badRequest(issues: unknown) {
  return NextResponse.json({ error: "Validation failed", issues }, { status: 400 });
}

/** Standard 404. */
export function notFound(resource = "Resource") {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

/** 422 — semantically valid request that violates a state-machine or invariant. */
export function unprocessable(message: string) {
  return NextResponse.json({ error: message }, { status: 422 });
}
