import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { renderEmail, type RenderVars } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/transport";
import { BILLING_AUDIT_ACTIONS } from "./billing-audit-actions";
import { notifyAdminsHourlyBankLow } from "./notification-triggers";

/**
 * Wave-2 hourly-bank low-balance alert.
 *
 * For each active hourly bank, compute consumed-vs-total. When a bank reaches
 * the 90% threshold AND no `HourlyBankAlertLog` row exists for it at the 90
 * tier within the last 30 days, fire:
 *   - a `HourlyBankAlertLog` dedup row,
 *   - a `hourly_bank_low` dashboard notification to every admin (+ optional
 *     `hourly_bank_low_admin` email),
 *   - a `hourly_bank_low_client` email to the client (via the transport seam;
 *     test-mode by default).
 *
 * Idempotent: a bank that alerted within the dedup window is skipped.
 */

const ALERT_THRESHOLD_PERCENT = 90;
const DEDUP_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ScanSummary extends Record<string, unknown> {
  scanned: number;
  alerted: number;
  deduped: number;
  skipped: number;
}

/** Resolve active admin user ids. */
async function getActiveAdminIds(
  tx: Prisma.TransactionClient,
): Promise<string[]> {
  const admins = await tx.user.findMany({
    where: { isActive: true, role: { isAdmin: true } },
    select: { id: true },
  });
  return admins.map((u) => u.id);
}

/**
 * Scan active hourly banks and fire the 90% low-balance alert. Each bank is
 * handled in its own transaction so one client's failure does not block the
 * rest of the scan.
 */
export async function scanHourlyBankUsage(now: Date = new Date()): Promise<ScanSummary> {
  const summary: ScanSummary = { scanned: 0, alerted: 0, deduped: 0, skipped: 0 };

  const banks = await prisma.hourlyBank.findMany({
    where: { status: "active", totalHoursPurchasedMinutes: { not: null } },
    select: {
      id: true,
      totalHoursPurchasedMinutes: true,
      billingAccount: {
        select: {
          client: { select: { id: true, companyName: true, email: true } },
        },
      },
    },
  });

  summary.scanned = banks.length;
  if (banks.length === 0) return summary;

  // Sum consumed minutes per bank in one query.
  const bankIds = banks.map((b) => b.id);
  const usageRows = await prisma.hourlyBankUsage.groupBy({
    by: ["hourlyBankId"],
    where: { hourlyBankId: { in: bankIds } },
    _sum: { minutesUsed: true },
  });
  const consumedByBank = new Map<string, number>();
  for (const row of usageRows) {
    consumedByBank.set(row.hourlyBankId, row._sum.minutesUsed ?? 0);
  }

  const dedupCutoff = new Date(now.getTime() - DEDUP_WINDOW_DAYS * DAY_MS);

  for (const bank of banks) {
    const total = bank.totalHoursPurchasedMinutes ?? 0;
    if (total <= 0) {
      summary.skipped += 1;
      continue;
    }
    const consumed = consumedByBank.get(bank.id) ?? 0;
    const percent = Math.floor((consumed / total) * 100);
    if (percent < ALERT_THRESHOLD_PERCENT) {
      summary.skipped += 1;
      continue;
    }

    // Dedup: recent alert log at the 90 tier?
    const recent = await prisma.hourlyBankAlertLog.findFirst({
      where: {
        hourlyBankId: bank.id,
        thresholdPercent: ALERT_THRESHOLD_PERCENT,
        createdAt: { gte: dedupCutoff },
      },
      select: { id: true },
    });
    if (recent) {
      summary.deduped += 1;
      continue;
    }

    const client = bank.billingAccount.client;

    await prisma.$transaction(async (tx) => {
      await tx.hourlyBankAlertLog.create({
        data: {
          hourlyBankId: bank.id,
          consumedMinutes: consumed,
          totalMinutes: total,
          thresholdPercent: ALERT_THRESHOLD_PERCENT,
        },
      });

      const adminIds = await getActiveAdminIds(tx);
      const company = await tx.companySettings.findFirst({
        select: { legalNameEn: true, legalNameHe: true, websiteUrl: true },
      });
      const companyName =
        company?.legalNameEn || company?.legalNameHe || "Skyware";
      const contactUrl = company?.websiteUrl || "";

      // Admin dashboard notification.
      await notifyAdminsHourlyBankLow(tx, {
        adminUserIds: adminIds,
        hourlyBankId: bank.id,
        clientId: client.id,
        clientName: client.companyName,
        consumedPercent: percent,
      });

      // Optional admin email.
      const adminTemplate = await tx.emailTemplate.findUnique({
        where: { kind: "hourly_bank_low_admin" },
      });
      if (adminTemplate) {
        const adminVars: RenderVars = {
          client_name: client.companyName,
          company_name: companyName,
          contact_url: contactUrl,
          days_overdue: percent,
        };
        for (const adminId of adminIds) {
          const admin = await tx.user.findUnique({
            where: { id: adminId },
            select: { email: true, languagePref: true },
          });
          if (!admin?.email) continue;
          const lang = admin.languagePref === "he" ? "he" : "en";
          const rendered = renderEmail(adminTemplate, lang, adminVars);
          await sendEmail(tx, {
            kind: "hourly_bank_low_admin",
            toEmail: admin.email,
            subject: rendered.subject,
            bodyHtml: rendered.bodyHtml,
            bodyText: rendered.bodyText,
            language: lang,
            links: { hourlyBankId: bank.id, clientId: client.id },
            triggeredByUserId: null,
          });
        }
      }

      // Client email (test-mode by default). Only when the client has an email.
      if (client.email) {
        const clientTemplate = await tx.emailTemplate.findUnique({
          where: { kind: "hourly_bank_low_client" },
        });
        if (clientTemplate) {
          const clientVars: RenderVars = {
            client_name: client.companyName,
            company_name: companyName,
            contact_url: contactUrl,
          };
          const rendered = renderEmail(clientTemplate, "he", clientVars);
          await sendEmail(tx, {
            kind: "hourly_bank_low_client",
            toEmail: client.email,
            subject: rendered.subject,
            bodyHtml: rendered.bodyHtml,
            bodyText: rendered.bodyText,
            language: "he",
            links: { hourlyBankId: bank.id, clientId: client.id },
            triggeredByUserId: null,
          });
        }
      }

      await writeAudit(tx, {
        actorUserId: null,
        action: BILLING_AUDIT_ACTIONS.HOURLY_BANK_ALERT_FIRED,
        entityType: "HourlyBank",
        entityId: bank.id,
        diff: {
          consumedMinutes: { old: null, new: consumed },
          totalMinutes: { old: null, new: total },
          percent: { old: null, new: percent },
          clientId: { old: null, new: client.id },
        },
      });
    });

    summary.alerted += 1;
  }

  return summary;
}
