import type { EmailTemplateKind, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { renderAdHoc, renderEmail, type RenderVars } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/transport";
import { BILLING_AUDIT_ACTIONS } from "./billing-audit-actions";
import { notifyManualContactSent } from "./notification-triggers";

/**
 * Ad-hoc client contact.
 *
 * An admin composes a message to a client — either by picking a stored
 * template (default `manual_contact`) and letting the variables interpolate,
 * or by supplying their own previewed subject + body. Either way the email
 * goes through `lib/email/transport.ts` (test-mode by default), is recorded in
 * `EmailLog`, and is audited. A `manual_contact_sent` notification is written
 * to the acting admin (clients have no portal login).
 *
 * Admin-only: the caller (route) enforces `canSendManualContact`.
 */

export interface ManualContactArgs {
  actorUserId: string;
  clientId: string;
  paymentId?: string;
  hourlyBankId?: string;
  /** Which stored template to use; defaults to `manual_contact`. */
  templateKind?: EmailTemplateKind;
  language: "en" | "he";
  /** When the admin previewed + edited their own subject, send that verbatim. */
  overrideSubject?: string;
  /** When the admin previewed + edited their own body, send that verbatim. */
  overrideBody?: string;
  /** Extra render vars to merge on top of the resolved defaults. */
  vars?: RenderVars;
}

export class ManualContactError extends Error {}

export interface ManualContactResult {
  emailLogId: string;
  testMode: boolean;
  status: "queued" | "sent" | "failed";
}

export async function sendManualContact(
  tx: Prisma.TransactionClient,
  args: ManualContactArgs,
): Promise<ManualContactResult> {
  const client = await tx.client.findUnique({
    where: { id: args.clientId },
    select: { id: true, companyName: true, email: true },
  });
  if (!client) throw new ManualContactError("Client not found");
  if (!client.email) {
    throw new ManualContactError("Client has no email address on file");
  }

  const company = await tx.companySettings.findFirst({
    select: { legalNameEn: true, legalNameHe: true, websiteUrl: true },
  });
  const companyName = company?.legalNameEn || company?.legalNameHe || "Skyware";
  const contactUrl = company?.websiteUrl || "";

  const baseVars: RenderVars = {
    client_name: client.companyName,
    company_name: companyName,
    contact_url: contactUrl,
    ...(args.vars ?? {}),
  };

  const hasOverride =
    typeof args.overrideSubject === "string" &&
    typeof args.overrideBody === "string";

  let rendered;
  if (hasOverride) {
    rendered = renderAdHoc(
      args.overrideSubject as string,
      args.overrideBody as string,
      baseVars,
    );
  } else {
    const kind = args.templateKind ?? "manual_contact";
    const template = await tx.emailTemplate.findUnique({ where: { kind } });
    if (!template) {
      throw new ManualContactError(`Template not found: ${kind}`);
    }
    rendered = renderEmail(template, args.language, baseVars);
  }

  const result = await sendEmail(tx, {
    kind: "manual_contact",
    toEmail: client.email,
    subject: rendered.subject,
    bodyHtml: rendered.bodyHtml,
    bodyText: rendered.bodyText,
    language: args.language,
    links: {
      clientId: client.id,
      ...(args.paymentId ? { paymentId: args.paymentId } : {}),
      ...(args.hourlyBankId ? { hourlyBankId: args.hourlyBankId } : {}),
    },
    triggeredByUserId: args.actorUserId,
  });

  await writeAudit(tx, {
    actorUserId: args.actorUserId,
    action: BILLING_AUDIT_ACTIONS.MANUAL_CONTACT_SENT,
    entityType: "Client",
    entityId: client.id,
    diff: {
      emailLogId: { old: null, new: result.emailLogId },
      testMode: { old: null, new: result.testMode },
      templateKind: {
        old: null,
        new: hasOverride ? "override" : (args.templateKind ?? "manual_contact"),
      },
      paymentId: { old: null, new: args.paymentId ?? null },
      hourlyBankId: { old: null, new: args.hourlyBankId ?? null },
    },
  });

  await notifyManualContactSent(tx, {
    actorUserId: args.actorUserId,
    clientId: client.id,
    clientName: client.companyName,
    emailLogId: result.emailLogId,
    testMode: result.testMode,
  });

  return {
    emailLogId: result.emailLogId,
    testMode: result.testMode,
    status: result.status,
  };
}
