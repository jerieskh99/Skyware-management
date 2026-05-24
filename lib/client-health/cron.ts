import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFeatureFlag } from "@/lib/feature-flags";
import { computeSnapshotFor, isoWeekRange } from "@/lib/client-health/compute";

/**
 * Client-health weekly snapshot writer.
 *
 * For each active client compute the current ISO-week KPI snapshot and upsert
 * by `(clientId, periodStart)`. Idempotent — re-running the same week updates
 * the existing row in place rather than inserting duplicates.
 *
 * Gated by `client_health_snapshots_enabled`. When off, returns zeros without
 * writing.
 */
export async function runClientHealthSnapshotsCron(): Promise<{
  scanned: number;
  written: number;
  skipped: number;
}> {
  const enabled = await getFeatureFlag("client_health_snapshots_enabled");
  if (!enabled) {
    return { scanned: 0, written: 0, skipped: 0 };
  }

  const clients = await prisma.client.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  if (clients.length === 0) {
    return { scanned: 0, written: 0, skipped: 0 };
  }

  const { periodStart, periodEnd } = isoWeekRange();

  let written = 0;
  let skipped = 0;
  for (const c of clients) {
    try {
      const snap = await computeSnapshotFor(c.id, periodStart, periodEnd);
      await prisma.clientHealthSnapshot.upsert({
        where: { client_period_unique: { clientId: c.id, periodStart } },
        create: {
          clientId: c.id,
          periodStart,
          periodEnd,
          openJobs: snap.openJobs,
          delayedJobs: snap.delayedJobs,
          hoursConsumed: snap.hoursConsumed,
          outstandingMinorUnits: snap.outstandingMinorUnits,
          avgProjectedMonths: snap.avgProjectedMonths,
          extra: {} as Prisma.InputJsonValue,
        },
        update: {
          periodEnd,
          openJobs: snap.openJobs,
          delayedJobs: snap.delayedJobs,
          hoursConsumed: snap.hoursConsumed,
          outstandingMinorUnits: snap.outstandingMinorUnits,
          avgProjectedMonths: snap.avgProjectedMonths,
          generatedAt: new Date(),
        },
      });
      written += 1;
    } catch {
      skipped += 1;
    }
  }

  return { scanned: clients.length, written, skipped };
}
