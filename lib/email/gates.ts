import { getFeatureFlag } from "@/lib/feature-flags";

/**
 * Production email send gate.
 *
 * Mirrors the three-gate receipts lock in `lib/compliance/gates.ts`. Real
 * client email is only ever transmitted when ALL of the following hold:
 *
 *   1. feature flag `billing_email_real_send` = true
 *   2. env `ALLOW_PRODUCTION_EMAIL` = "true"
 *   3. env `EMAIL_PROVIDER` is set to a non-empty provider token
 *      (e.g. "resend" | "sendgrid" | "ses" | "smtp")
 *
 * Any single condition failing keeps the system in TEST MODE: every email is
 * written to `EmailLog` with `testMode = true, status = queued` and is NEVER
 * handed to a transport.
 *
 * NOTE: even when all three gates pass, V2 still does not transmit — the
 * transport seam in `lib/email/transport.ts` deliberately throws because the
 * real provider integration is a separate, reviewed follow-up. The gates here
 * are the policy layer; the transport is the (intentionally unwired) mechanism.
 */

/** True only when the env says production email sending is allowed. */
export function envAllowsProductionEmail(): boolean {
  return process.env.ALLOW_PRODUCTION_EMAIL === "true";
}

/** Recognized provider tokens. The set is informational; any non-empty value passes the gate. */
export const KNOWN_EMAIL_PROVIDERS = ["resend", "sendgrid", "ses", "smtp"] as const;

/** True only when `EMAIL_PROVIDER` env is set to a non-empty value. */
export function envHasEmailProvider(): boolean {
  const provider = process.env.EMAIL_PROVIDER?.trim();
  return Boolean(provider);
}

/**
 * Resolve whether real email send is allowed. Returns true only when the
 * feature flag AND both env gates are satisfied. Any false keeps test mode.
 */
export async function emailRealSendAllowed(): Promise<boolean> {
  if (!envAllowsProductionEmail()) return false;
  if (!envHasEmailProvider()) return false;
  const flagOn = await getFeatureFlag("billing_email_real_send");
  return flagOn;
}

/** Test mode is simply the negation of real-send-allowed. */
export function isEmailTestMode(realAllowed: boolean): boolean {
  return !realAllowed;
}
