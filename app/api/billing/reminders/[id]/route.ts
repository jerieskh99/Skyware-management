import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  forbidden,
  badRequest,
  notFound,
  unprocessable,
} from "@/lib/api-utils";
import { getFeatureFlag } from "@/lib/feature-flags";
import { canManageReminders } from "@/lib/billing/permissions";
import {
  decideReminder,
  ReminderNotFoundError,
  ReminderTransitionError,
  type ReminderDecision,
} from "@/lib/billing/reminders";

interface Params {
  params: Promise<{ id: string }>;
}

const patchSchema = z
  .object({
    action: z.enum(["approve", "delay", "cancel", "send_now"]),
    comment: z.string().trim().max(2000).optional(),
    newScheduledFor: z
      .string()
      .datetime({ offset: true })
      .optional(),
  })
  .refine((d) => d.action !== "delay" || Boolean(d.newScheduledFor), {
    message: "newScheduledFor is required when action is 'delay'.",
    path: ["newScheduledFor"],
  });

/**
 * PATCH /api/billing/reminders/[id] — apply an admin decision to a reminder.
 *
 * Body: { action: "approve"|"delay"|"cancel"|"send_now", comment?, newScheduledFor? }
 *   - newScheduledFor (ISO-8601 with offset) is required for "delay".
 *
 * Gated by `billing_reminders_enabled` (404 when off). Admin-only.
 * Returns the updated reminder: { id, status }.
 * 422 when the decision is illegal for the reminder's current state.
 */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!canManageReminders(auth.user)) return forbidden();

  if (!(await getFeatureFlag("billing_reminders_enabled"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);

  try {
    const result = await prisma.$transaction((tx) =>
      decideReminder(tx, {
        reminderId: id,
        adminUserId: auth.user.id,
        decision: parsed.data.action as ReminderDecision,
        ...(parsed.data.comment ? { comment: parsed.data.comment } : {}),
        ...(parsed.data.newScheduledFor
          ? { newScheduledFor: new Date(parsed.data.newScheduledFor) }
          : {}),
      }),
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ReminderNotFoundError) return notFound("Reminder");
    if (err instanceof ReminderTransitionError) {
      return unprocessable(err.message);
    }
    throw err;
  }
}
