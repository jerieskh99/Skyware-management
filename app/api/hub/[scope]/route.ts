import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { canTakeInHub } from "@/lib/permissions";

// Use string in Params — Next.js 15 type validator requires the param type
// to match the generated string constraint. Scope is validated at runtime.
interface Params { params: Promise<{ scope: string }> }

const VALID_SCOPES = ["global", "helpdesk", "it", "rnd"] as const;
type Scope = (typeof VALID_SCOPES)[number];

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { scope: raw } = await params;
  if (!(VALID_SCOPES as readonly string[]).includes(raw))
    return forbidden("Invalid hub scope");
  const scope = raw as Scope;
  if (!canTakeInHub(user, scope)) return forbidden();

  const jobs = await prisma.job.findMany({
    where: {
      status: "available",
      department: { key: scope },
    },
    select: {
      id: true,
      publicNumber: true,
      title: true,
      description: true,
      priority: true,
      severity: true,
      slaTargetMinutes: true,
      createdAt: true,
      client: { select: { companyName: true } },
      department: { select: { key: true, nameEn: true } },
      createdBy: { select: { username: true, displayName: true } },
      tags: {
        select: { tag: { select: { key: true, labelEn: true, colorHex: true } } },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(jobs);
}
