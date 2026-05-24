import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-utils";
import { listVisibleChannels } from "@/lib/communication/queries";

/** GET — channels visible to the current user. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const channels = await listVisibleChannels(auth.user);
  return NextResponse.json(channels);
}
