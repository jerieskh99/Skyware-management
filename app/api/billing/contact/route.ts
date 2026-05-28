import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  badRequest,
  unprocessable,
} from "@/lib/api-utils";
import {
  checkRateLimit,
  getClientIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import { getFeatureFlag } from "@/lib/feature-flags";
import { canSendManualContact } from "@/lib/billing/permissions";
import {
  sendManualContact,
  ManualContactError,
} from "@/lib/billing/manual-contact";

const TEMPLATE_KINDS = [
  "payment_reminder_admin",
  "payment_reminder_client",
  "hourly_bank_low_admin",
  "hourly_bank_low_client",
  "manual_contact",
] as const;

const bodySchema = z
  .object({
    clientId: z.string().uuid(),
    paymentId: z.string().uuid().optional(),
    hourlyBankId: z.string().uuid().optional(),
    templateKind: z.enum(TEMPLATE_KINDS).optional(),
    language: z.enum(["en", "he"]),
    subject: z.string().trim().min(1).max(500).optional(),
    body: z.string().trim().min(1).max(20_000).optional(),
    vars: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  })
  .refine(
    // subject + body must be supplied together (the override pair) or neither.
    (d) => Boolean(d.subject) === Boolean(d.body),
    {
      message: "subject and body must be provided together (override) or omitted.",
      path: ["subject"],
    },
  );

// Manual sends are admin-driven; cap to prevent an accidental loop blasting a
// client. 30 per 15 minutes per IP is generous for hand-composed messages.
const MANUAL_CONTACT_LIMIT = { windowMs: 15 * 60 * 1000, max: 30 };

/**
 * POST /api/billing/contact — send an ad-hoc email to a client.
 *
 * Body: { clientId, paymentId?, hourlyBankId?, templateKind?, language,
 *         subject?, body?, vars? }
 *   - subject+body together send a verbatim (previewed) override.
 *   - otherwise the stored template (default `manual_contact`) is rendered.
 *
 * Gated by `manual_contact_enabled` (404 when off). Admin-only.
 * Returns: { emailLogId, testMode, status }.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!canSendManualContact(auth.user)) return forbidden();

  if (!(await getFeatureFlag("manual_contact_enabled"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip = getClientIp(req);
  if (checkRateLimit(`manual-contact:${ip}`, MANUAL_CONTACT_LIMIT)) {
    return tooManyRequests();
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const d = parsed.data;

  try {
    const result = await prisma.$transaction((tx) =>
      sendManualContact(tx, {
        actorUserId: auth.user.id,
        clientId: d.clientId,
        ...(d.paymentId ? { paymentId: d.paymentId } : {}),
        ...(d.hourlyBankId ? { hourlyBankId: d.hourlyBankId } : {}),
        ...(d.templateKind ? { templateKind: d.templateKind } : {}),
        language: d.language,
        ...(d.subject ? { overrideSubject: d.subject } : {}),
        ...(d.body ? { overrideBody: d.body } : {}),
        ...(d.vars ? { vars: d.vars } : {}),
      }),
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ManualContactError) return unprocessable(err.message);
    throw err;
  }
}
