import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { FALLBACK_PRIORITY_SLA_MINUTES } from "@/lib/sla";
import type { JobPriority } from "@prisma/client";

/** GET — list SLA defaults per priority. Admin only. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const rows = await prisma.slaDefaults.findMany({
    select: { priority: true, targetMinutes: true, updatedAt: true },
  });

  // Fill missing priorities with hardcoded fallback so the admin UI can show
  // every priority even if the table was never seeded.
  const byPriority = new Map(rows.map((r) => [r.priority, r]));
  const all: Array<{ priority: JobPriority; targetMinutes: number; updatedAt: Date | null }> = (
    Object.keys(FALLBACK_PRIORITY_SLA_MINUTES) as JobPriority[]
  ).map((p) => {
    const row = byPriority.get(p);
    return {
      priority: p,
      targetMinutes: row?.targetMinutes ?? FALLBACK_PRIORITY_SLA_MINUTES[p],
      updatedAt: row?.updatedAt ?? null,
    };
  });

  // Stable ordering: urgent, high, normal, low (most-urgent first).
  const order: JobPriority[] = ["urgent", "high", "normal", "low"];
  all.sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));

  return NextResponse.json(all);
}
