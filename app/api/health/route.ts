import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const ts = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok", ts });
  } catch {
    return NextResponse.json(
      { status: "error", database: "unreachable", ts },
      { status: 503 },
    );
  }
}
