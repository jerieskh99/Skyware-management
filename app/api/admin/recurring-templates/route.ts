import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import {
  createTemplate,
  createTemplateSchema,
  listTemplates,
  type ListFilters,
} from "@/lib/recurring/template-queries";

/** GET — list recurring templates. Admin only. */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const departmentId = searchParams.get("departmentId");
  const clientId = searchParams.get("clientId");

  const filters: ListFilters = {};
  if (status === "active" || status === "paused") filters.status = status;
  if (departmentId) filters.departmentId = departmentId;
  if (clientId) filters.clientId = clientId;

  const rows = await listTemplates(filters);
  return NextResponse.json(rows);
}

/** POST — create recurring template. Admin only. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isAdmin(auth.user)) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  const created = await prisma.$transaction(async (tx) => {
    return createTemplate(tx, { actorUserId: auth.user.id, input: parsed.data });
  });

  return NextResponse.json(created, { status: 201 });
}
