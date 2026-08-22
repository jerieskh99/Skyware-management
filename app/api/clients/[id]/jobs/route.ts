import { NextResponse } from "next/server";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { listClientJobOptions } from "@/lib/clients/queries";

interface Params { params: Promise<{ id: string }> }

/**
 * GET — jobs belonging to this client, for use in client-scoped pickers
 * (e.g. the hourly-bank "Log usage" dialog). Admin only, matching the sibling
 * billing endpoints. Returns [{ id, publicNumber, title, status }] most-recent
 * first.
 */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { id: clientId } = await params;
  const jobs = await listClientJobOptions(clientId);
  return NextResponse.json(jobs);
}
