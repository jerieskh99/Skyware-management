import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { getFeatureFlag } from "@/lib/feature-flags";
import { canEditEmailTemplates } from "@/lib/billing/permissions";

/**
 * GET /api/admin/email-templates — list all email templates.
 *
 * Gated by `email_templates_admin_ui` (404 when off). Admin-only.
 * Returns: { templates: [{ id, kind, name, subjectEn, bodyEn, subjectHe,
 *            bodyHe, variableNotes, updatedAt }] }.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!canEditEmailTemplates(auth.user)) return forbidden();

  if (!(await getFeatureFlag("email_templates_admin_ui"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const templates = await prisma.emailTemplate.findMany({
    select: {
      id: true,
      kind: true,
      name: true,
      subjectEn: true,
      bodyEn: true,
      subjectHe: true,
      bodyHe: true,
      variableNotes: true,
      updatedAt: true,
    },
    orderBy: { kind: "asc" },
  });

  return NextResponse.json({ templates });
}
