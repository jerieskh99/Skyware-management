import type { Prisma } from "@prisma/client";

/** Generate the next public job number (e.g. "2026-0007") inside a transaction.
 *  Uses MAX + 1 under a serializable-level transaction lock provided by the caller.
 */
export async function generatePublicNumber(
  tx: Prisma.TransactionClient
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;

  const last = await tx.job.findFirst({
    where: { publicNumber: { startsWith: prefix } },
    orderBy: { publicNumber: "desc" },
    select: { publicNumber: true },
  });

  const lastSeq = last
    ? parseInt(last.publicNumber.slice(prefix.length), 10)
    : 0;

  const next = lastSeq + 1;
  return `${year}-${String(next).padStart(4, "0")}`;
}
