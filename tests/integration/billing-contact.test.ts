import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "@/app/api/billing/contact/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

/**
 * POST /api/billing/contact — ad-hoc client email.
 *
 * 200 test-mode result, 422 when the client has no email, 403 non-admin,
 * 404 when `manual_contact_enabled` is off, and the subject/body
 * both-or-neither validation (400). Email stays in test mode throughout.
 */

const URL = "http://localhost/api/billing/contact";
const CLIENT_ID = "00000000-0000-0000-0000-0000000000c1";

let ipCounter = 0;

function makeRequest(body: unknown) {
  // Unique IP per call so the in-memory rate limiter never bleeds across tests.
  ipCounter += 1;
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

function setFlags(flags: Record<string, boolean>) {
  prisma.featureFlag.findUnique.mockImplementation(async (args: unknown) => {
    const key = (args as { where?: { key?: string } } | undefined)?.where?.key;
    if (!key) return null;
    return key in flags ? { enabled: flags[key] } : { enabled: false };
  });
}

function primeCompanyAndTemplate() {
  prisma.companySettings.findFirst.mockResolvedValue({
    legalNameEn: "Skyware Ltd",
    legalNameHe: "סקייוור",
    websiteUrl: "https://skyware.example",
  });
  prisma.emailTemplate.findUnique.mockResolvedValue({
    id: "tpl-manual",
    kind: "manual_contact",
    name: "manual",
    subjectEn: "Hello {{client_name}}",
    bodyEn: "From {{company_name}}",
    subjectHe: "שלום {{client_name}}",
    bodyHe: "מאת {{company_name}}",
    variableNotes: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.emailLog.create.mockResolvedValue({ id: "log-1" });
  prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  prisma.notification.create.mockResolvedValue({ id: "n-1" });
}

describe("POST /api/billing/contact", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    setFlags({ manual_contact_enabled: true, notifications_enabled: false });
    delete process.env["ALLOW_PRODUCTION_EMAIL"];
    delete process.env["EMAIL_PROVIDER"];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 403 for a non-admin", async () => {
    mockAuthAs(makeEmployeeSession({ department: "it" }));
    const res = await POST(makeRequest({ clientId: CLIENT_ID, language: "en" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when manual_contact_enabled is off", async () => {
    setFlags({ manual_contact_enabled: false });
    const res = await POST(makeRequest({ clientId: CLIENT_ID, language: "en" }));
    expect(res.status).toBe(404);
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when subject is provided without body (override must be paired)", async () => {
    const res = await POST(
      makeRequest({ clientId: CLIENT_ID, language: "en", subject: "Hi" }),
    );
    expect(res.status).toBe(400);
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when body is provided without subject", async () => {
    const res = await POST(
      makeRequest({ clientId: CLIENT_ID, language: "en", body: "Some body" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when the client has no email on file", async () => {
    primeCompanyAndTemplate();
    prisma.client.findUnique.mockResolvedValueOnce({
      id: CLIENT_ID,
      companyName: "Acme",
      email: null,
    });

    const res = await POST(makeRequest({ clientId: CLIENT_ID, language: "en" }));
    expect(res.status).toBe(422);
    expect(prisma.emailLog.create).not.toHaveBeenCalled();
  });

  it("returns 200 with a test-mode result rendering the stored template", async () => {
    primeCompanyAndTemplate();
    prisma.client.findUnique.mockResolvedValueOnce({
      id: CLIENT_ID,
      companyName: "Acme",
      email: "billing@acme.example",
    });

    const res = await POST(makeRequest({ clientId: CLIENT_ID, language: "en" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      emailLogId: string;
      testMode: boolean;
      status: string;
    };
    expect(body.testMode).toBe(true);
    expect(body.status).toBe("queued");
    expect(body.emailLogId).toBe("log-1");

    // The stored template was consulted (not an override).
    expect(prisma.emailTemplate.findUnique).toHaveBeenCalledWith({
      where: { kind: "manual_contact" },
    });
    const logArg = prisma.emailLog.create.mock.calls[0]?.[0] as {
      data: { kind: string; testMode: boolean; toEmail: string };
    };
    expect(logArg.data.kind).toBe("manual_contact");
    expect(logArg.data.testMode).toBe(true);
    expect(logArg.data.toEmail).toBe("billing@acme.example");
  });

  it("returns 200 using a verbatim override subject + body (no template lookup)", async () => {
    primeCompanyAndTemplate();
    prisma.client.findUnique.mockResolvedValueOnce({
      id: CLIENT_ID,
      companyName: "Acme",
      email: "billing@acme.example",
    });

    const res = await POST(
      makeRequest({
        clientId: CLIENT_ID,
        language: "en",
        subject: "Re: your account",
        body: "Hi {{client_name}}, a quick note.",
      }),
    );
    expect(res.status).toBe(200);
    // Override path must NOT read a stored template.
    expect(prisma.emailTemplate.findUnique).not.toHaveBeenCalled();
    const logArg = prisma.emailLog.create.mock.calls[0]?.[0] as {
      data: { subject: string };
    };
    expect(logArg.data.subject).toBe("Re: your account");
  });
});
