import { Prisma } from "@prisma/client";
import type { EmailKind } from "@prisma/client";
import { emailRealSendAllowed } from "./gates";

/**
 * Email transport seam.
 *
 * This is the single choke point through which every email passes. It is
 * deliberately NOT wired to any real provider SDK in V2:
 *
 *   1. It resolves `emailRealSendAllowed()` (the 3-gate policy).
 *   2. It ALWAYS writes an `EmailLog` row inside the caller's transaction so
 *      there is a durable audit trail of every email the system intended to
 *      send, including the fully-rendered subject + body.
 *   3. In TEST MODE (the default), the row is written with `status = queued`
 *      and no network call is ever made.
 *   4. Even when all three gates pass, the "real" branch throws. The provider
 *      integration is a separate, reviewed follow-up; V2 must never transmit a
 *      real client email. To keep the attempt visible, the EmailLog row is
 *      marked `failed` with `failureReason = "provider_not_wired"` before the
 *      throw is surfaced.
 *
 * The function takes the caller's `tx` so the log row commits in lockstep with
 * the originating mutation (reminder decision, manual contact, cron scan).
 */

export interface SendInput {
  kind: EmailKind;
  toEmail: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  language: string;
  links: {
    paymentId?: string;
    paymentReminderId?: string;
    hourlyBankId?: string;
    clientId?: string;
  };
  triggeredByUserId?: string | null;
}

export interface SendResult {
  emailLogId: string;
  testMode: boolean;
  status: "queued" | "sent" | "failed";
  providerMessageId?: string;
  failureReason?: string;
}

/** Sentinel used when no company email and no EMAIL_FROM env is configured. */
const FALLBACK_FROM_EMAIL = "no-reply@example.invalid";

/**
 * Resolve the From address. Prefers the configured CompanySettings.email,
 * then the EMAIL_FROM env, then a clearly-fake sentinel so test-mode rows are
 * obviously non-deliverable.
 */
async function resolveFromEmail(tx: Prisma.TransactionClient): Promise<string> {
  const settings = await tx.companySettings.findFirst({
    select: { email: true },
  });
  const companyEmail = settings?.email?.trim();
  if (companyEmail) return companyEmail;
  const envFrom = process.env.EMAIL_FROM?.trim();
  if (envFrom) return envFrom;
  return FALLBACK_FROM_EMAIL;
}

/**
 * Write the EmailLog row and (in test mode) stop. The provider branch is
 * intentionally unimplemented and throws. See module docstring.
 */
export async function sendEmail(
  tx: Prisma.TransactionClient,
  input: SendInput,
): Promise<SendResult> {
  const realAllowed = await emailRealSendAllowed();
  const testMode = !realAllowed;
  const fromEmail = await resolveFromEmail(tx);

  // In real-send mode we record the attempt as `failed` (provider_not_wired)
  // so even a fully-gated environment leaves an audit trail and never
  // silently drops the email. In test mode we record `queued`.
  const status = testMode ? "queued" : "failed";
  const failureReason = testMode ? null : "provider_not_wired";

  const log = await tx.emailLog.create({
    data: {
      kind: input.kind,
      testMode,
      toEmail: input.toEmail,
      cc: input.cc && input.cc.length > 0 ? (input.cc as Prisma.InputJsonValue) : Prisma.JsonNull,
      bcc:
        input.bcc && input.bcc.length > 0
          ? (input.bcc as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      fromEmail,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      language: input.language,
      paymentId: input.links.paymentId ?? null,
      paymentReminderId: input.links.paymentReminderId ?? null,
      hourlyBankId: input.links.hourlyBankId ?? null,
      clientId: input.links.clientId ?? null,
      triggeredByUserId: input.triggeredByUserId ?? null,
      status,
      failureReason,
    },
    select: { id: true },
  });

  if (testMode) {
    return { emailLogId: log.id, testMode: true, status: "queued" };
  }

  // Real-send path is a deliberate, reviewed follow-up. V2 never transmits.
  // The EmailLog row above already records the failed attempt with reason
  // `provider_not_wired`, so the operator can see exactly what would have
  // been sent and why it was not.
  throw new Error("real email provider not wired in V2");
}
