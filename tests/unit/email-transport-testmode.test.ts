import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { sendEmail, type SendInput } from "@/lib/email/transport";

/**
 * `sendEmail` transport seam.
 *
 * - ALWAYS writes an EmailLog row (durable audit trail).
 * - TEST MODE (default): row is `queued`, testMode=true, and nothing throws.
 * - "real allowed" path (all three gates pass): the row is written `failed`
 *   with failureReason `provider_not_wired` AND the call throws — V2 never
 *   transmits a real email.
 *
 * The three gates are driven via env (`ALLOW_PRODUCTION_EMAIL`,
 * `EMAIL_PROVIDER`) + the `billing_email_real_send` feature flag, exercising
 * the real `emailRealSendAllowed` policy in both directions.
 */

function setFlags(flags: Record<string, boolean>) {
  prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
    const key = (args as { where?: { key?: string } } | undefined)?.where?.key;
    if (!key) return null;
    return key in flags ? { enabled: flags[key] } : { enabled: false };
  });
}

function baseInput(): SendInput {
  return {
    kind: "manual_contact",
    toEmail: "client@example.test",
    subject: "Subject",
    bodyHtml: "<p>Body</p>",
    bodyText: "Body",
    language: "en",
    links: { clientId: "cli-1" },
    triggeredByUserId: "admin-1",
  };
}

describe("sendEmail — transport seam", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    prisma.companySettings.findFirst.mockResolvedValue({ email: "from@skyware.example" });
    prisma.emailLog.create.mockResolvedValue({ id: "log-1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("test mode (no env gates): writes a queued EmailLog and does not throw", async () => {
    delete process.env["ALLOW_PRODUCTION_EMAIL"];
    delete process.env["EMAIL_PROVIDER"];
    setFlags({ billing_email_real_send: true }); // flag alone is not enough

    const result = await sendEmail(prisma as never, baseInput());
    expect(result.testMode).toBe(true);
    expect(result.status).toBe("queued");

    expect(prisma.emailLog.create).toHaveBeenCalledTimes(1);
    const data = (prisma.emailLog.create.mock.calls[0]?.[0] as {
      data: { testMode: boolean; status: string; failureReason: string | null };
    }).data;
    expect(data.testMode).toBe(true);
    expect(data.status).toBe("queued");
    expect(data.failureReason).toBeNull();
  });

  it("stays in test mode when only env gates pass but the flag is off", async () => {
    process.env["ALLOW_PRODUCTION_EMAIL"] = "true";
    process.env["EMAIL_PROVIDER"] = "resend";
    setFlags({ billing_email_real_send: false });

    const result = await sendEmail(prisma as never, baseInput());
    expect(result.testMode).toBe(true);
    expect(result.status).toBe("queued");
  });

  it("real allowed (all 3 gates pass): writes a failed provider_not_wired row AND throws", async () => {
    process.env["ALLOW_PRODUCTION_EMAIL"] = "true";
    process.env["EMAIL_PROVIDER"] = "resend";
    setFlags({ billing_email_real_send: true });

    await expect(
      sendEmail(prisma as never, baseInput()),
    ).rejects.toThrow(/provider not wired/i);

    // The attempt was still recorded as failed/provider_not_wired.
    expect(prisma.emailLog.create).toHaveBeenCalledTimes(1);
    const data = (prisma.emailLog.create.mock.calls[0]?.[0] as {
      data: { testMode: boolean; status: string; failureReason: string | null };
    }).data;
    expect(data.testMode).toBe(false);
    expect(data.status).toBe("failed");
    expect(data.failureReason).toBe("provider_not_wired");
  });

  it("resolves the From address from CompanySettings.email", async () => {
    delete process.env["ALLOW_PRODUCTION_EMAIL"];
    delete process.env["EMAIL_PROVIDER"];
    setFlags({});

    await sendEmail(prisma as never, baseInput());
    const data = (prisma.emailLog.create.mock.calls[0]?.[0] as {
      data: { fromEmail: string };
    }).data;
    expect(data.fromEmail).toBe("from@skyware.example");
  });
});
