import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  sendManualContact,
  ManualContactError,
} from "@/lib/billing/manual-contact";

/**
 * `sendManualContact` lib path: stored-template render vs verbatim override,
 * HTML escaping of interpolated vars in the HTML body, and en/he language
 * selection. Prisma + transport are mocked; transport stays in test mode so
 * no real email is sent (EmailLog row is written with testMode=true).
 *
 * The functions take a `tx`; the mocked Prisma client itself is a valid
 * transaction-like surface, so we pass `prisma as never` directly.
 */

function setFlags(flags: Record<string, boolean>) {
  prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
    const key = (args as { where?: { key?: string } } | undefined)?.where?.key;
    if (!key) return null;
    return key in flags ? { enabled: flags[key] } : { enabled: false };
  });
}

const CLIENT_ID = "cli-1";

function template() {
  return {
    id: "tpl-manual",
    kind: "manual_contact" as const,
    name: "manual",
    subjectEn: "Hello {{client_name}}",
    bodyEn: "Dear {{client_name}}, regards {{company_name}}",
    subjectHe: "שלום {{client_name}}",
    bodyHe: "{{client_name}} יקר",
    variableNotes: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Capture the args handed to the transport via emailLog.create. */
function lastEmailLogData(): {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  language: string;
  testMode: boolean;
  kind: string;
  toEmail: string;
} {
  const call = prisma.emailLog.create.mock.calls.at(-1)?.[0] as {
    data: {
      subject: string;
      bodyHtml: string;
      bodyText: string;
      language: string;
      testMode: boolean;
      kind: string;
      toEmail: string;
    };
  };
  return call.data;
}

describe("sendManualContact", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    setFlags({ notifications_enabled: false });
    delete process.env["ALLOW_PRODUCTION_EMAIL"];
    delete process.env["EMAIL_PROVIDER"];
    prisma.companySettings.findFirst.mockResolvedValue({
      legalNameEn: "Skyware Ltd",
      legalNameHe: "סקייוור",
      websiteUrl: "https://skyware.example",
    });
    prisma.emailLog.create.mockResolvedValue({ id: "log-1" });
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
    prisma.notification.create.mockResolvedValue({ id: "n-1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws when the client has no email", async () => {
    prisma.client.findUnique.mockResolvedValueOnce({
      id: CLIENT_ID,
      companyName: "Acme",
      email: null,
    });
    await expect(
      sendManualContact(prisma as never, {
        actorUserId: "admin-1",
        clientId: CLIENT_ID,
        language: "en",
      }),
    ).rejects.toBeInstanceOf(ManualContactError);
    expect(prisma.emailLog.create).not.toHaveBeenCalled();
  });

  it("renders the stored template in English (test mode, queued)", async () => {
    prisma.client.findUnique.mockResolvedValueOnce({
      id: CLIENT_ID,
      companyName: "Acme",
      email: "ar@acme.example",
    });
    prisma.emailTemplate.findUnique.mockResolvedValueOnce(template());

    const result = await sendManualContact(prisma as never, {
      actorUserId: "admin-1",
      clientId: CLIENT_ID,
      language: "en",
    });
    expect(result.testMode).toBe(true);
    expect(result.status).toBe("queued");

    const data = lastEmailLogData();
    expect(data.kind).toBe("manual_contact");
    expect(data.language).toBe("en");
    expect(data.subject).toBe("Hello Acme");
    expect(data.bodyText).toBe("Dear Acme, regards Skyware Ltd");
    expect(data.testMode).toBe(true);
  });

  it("selects the Hebrew subject + body when language=he", async () => {
    prisma.client.findUnique.mockResolvedValueOnce({
      id: CLIENT_ID,
      companyName: "Acme",
      email: "ar@acme.example",
    });
    prisma.emailTemplate.findUnique.mockResolvedValueOnce(template());

    await sendManualContact(prisma as never, {
      actorUserId: "admin-1",
      clientId: CLIENT_ID,
      language: "he",
    });
    const data = lastEmailLogData();
    expect(data.language).toBe("he");
    expect(data.subject).toBe("שלום Acme");
    expect(data.bodyText).toContain("Acme יקר");
  });

  it("uses a verbatim override and does NOT read a stored template", async () => {
    prisma.client.findUnique.mockResolvedValueOnce({
      id: CLIENT_ID,
      companyName: "Acme",
      email: "ar@acme.example",
    });

    await sendManualContact(prisma as never, {
      actorUserId: "admin-1",
      clientId: CLIENT_ID,
      language: "en",
      overrideSubject: "Re: {{client_name}}",
      overrideBody: "Quick note for {{client_name}}.",
    });
    // No stored-template lookup on the override path.
    expect(prisma.emailTemplate.findUnique).not.toHaveBeenCalled();
    const data = lastEmailLogData();
    expect(data.subject).toBe("Re: Acme");
    expect(data.bodyText).toBe("Quick note for Acme.");
  });

  it("HTML-escapes interpolated vars in the HTML body (injection-safe)", async () => {
    prisma.client.findUnique.mockResolvedValueOnce({
      id: CLIENT_ID,
      companyName: "<script>alert(1)</script>",
      email: "ar@acme.example",
    });

    await sendManualContact(prisma as never, {
      actorUserId: "admin-1",
      clientId: CLIENT_ID,
      language: "en",
      overrideSubject: "s",
      overrideBody: "Hi {{client_name}}",
    });
    const data = lastEmailLogData();
    // The HTML body must escape the value; the plain-text body keeps it raw.
    expect(data.bodyHtml).toContain("&lt;script&gt;");
    expect(data.bodyHtml).not.toContain("<script>");
    expect(data.bodyText).toContain("<script>alert(1)</script>");
  });

  it("writes a billing.manual_contact.sent audit row", async () => {
    prisma.client.findUnique.mockResolvedValueOnce({
      id: CLIENT_ID,
      companyName: "Acme",
      email: "ar@acme.example",
    });
    prisma.emailTemplate.findUnique.mockResolvedValueOnce(template());

    await sendManualContact(prisma as never, {
      actorUserId: "admin-1",
      clientId: CLIENT_ID,
      language: "en",
    });
    const auditArg = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string };
    };
    expect(auditArg.data.action).toBe("billing.manual_contact.sent");
    expect(auditArg.data.entityType).toBe("Client");
  });
});
