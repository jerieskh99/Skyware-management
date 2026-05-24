import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-utils";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const tags = await prisma.tag.findMany({
    select: { id: true, key: true, labelEn: true, labelHe: true, scope: true, colorHex: true },
    orderBy: { key: "asc" },
  });

  return NextResponse.json(tags);
}
