import { prisma } from "@/lib/prisma";
import type { ClientHealthSnapshot } from "@prisma/client";

export async function listSnapshots(
  clientId: string,
  opts: { limit?: number } = {}
): Promise<ClientHealthSnapshot[]> {
  return prisma.clientHealthSnapshot.findMany({
    where: { clientId },
    orderBy: { periodStart: "desc" },
    take: opts.limit ?? 8,
  });
}

export async function getLatestSnapshot(
  clientId: string
): Promise<ClientHealthSnapshot | null> {
  return prisma.clientHealthSnapshot.findFirst({
    where: { clientId },
    orderBy: { periodStart: "desc" },
  });
}
