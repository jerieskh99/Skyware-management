import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET as LIST } from "@/app/api/admin/email-templates/route";
import { PATCH } from "@/app/api/admin/email-templates/[kind]/route";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

/**
 * Email-template admin API (`/api/admin/email-templates`).
 * GET list, PATCH [kind] (updates + audits), 403 non-admin, and 404 when the
 * `email_templates_admin_ui` flag is off.
 */

const LIST_URL = "http://localhost/api/admin/email-templates";

function makeListRequest() {
  return new Request(LIST_URL, { method: "GET" });
}

function makePatchRequest(kind: string, body: unknown) {
  return new Request(`${LIST_URL}/${kind}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
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

describe("GET /api/admin/email-templates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
  });

  it("returns 403 for a non-admin", async () => {
    mockAuthAs(makeEmployeeSession({ department: "rnd" }));
    const res = await LIST();
    expect(res.status).toBe(403);
  });

  it("returns 404 when email_templates_admin_ui is off", async () => {
    mockAuthAs(makeAdminSession());
    setFlags({ email_templates_admin_ui: false });
    const res = await LIST();
    expect(res.status).toBe(404);
    expect(prisma.emailTemplate.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with the templates array for an admin", async () => {
    mockAuthAs(makeAdminSession());
    setFlags({ email_templates_admin_ui: true });
    prisma.emailTemplate.findMany.mockResolvedValueOnce([
      {
        id: "t1",
        kind: "manual_contact",
        name: "Manual contact",
        subjectEn: "S",
        bodyEn: "B",
        subjectHe: "ש",
        bodyHe: "ב",
        variableNotes: null,
        updatedAt: new Date("2026-05-01T00:00:00Z"),
      },
    ]);

    const res = await LIST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: Array<{ kind: string }> };
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0]!.kind).toBe("manual_contact");
  });
});

describe("PATCH /api/admin/email-templates/[kind]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
    setFlags({ email_templates_admin_ui: true });
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("returns 403 for a non-admin", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }));
    const res = await PATCH(makePatchRequest("manual_contact", { name: "X" }), {
      params: Promise.resolve({ kind: "manual_contact" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the flag is off", async () => {
    setFlags({ email_templates_admin_ui: false });
    const res = await PATCH(makePatchRequest("manual_contact", { name: "X" }), {
      params: Promise.resolve({ kind: "manual_contact" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown template kind", async () => {
    const res = await PATCH(makePatchRequest("not_a_kind", { name: "X" }), {
      params: Promise.resolve({ kind: "not_a_kind" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when no updatable field is provided", async () => {
    prisma.emailTemplate.findUnique.mockResolvedValueOnce({
      id: "t1",
      kind: "manual_contact",
    });
    const res = await PATCH(makePatchRequest("manual_contact", {}), {
      params: Promise.resolve({ kind: "manual_contact" }),
    });
    expect(res.status).toBe(400);
  });

  it("updates the subject + body and writes a billing.email_template.updated audit", async () => {
    prisma.emailTemplate.findUnique.mockResolvedValueOnce({
      id: "t1",
      kind: "manual_contact",
      subjectEn: "Old subject",
      bodyEn: "Old body",
    });
    prisma.emailTemplate.update.mockResolvedValueOnce({
      id: "t1",
      kind: "manual_contact",
      subjectEn: "New subject",
      bodyEn: "New body",
    });

    const res = await PATCH(
      makePatchRequest("manual_contact", {
        subjectEn: "New subject",
        bodyEn: "New body",
      }),
      { params: Promise.resolve({ kind: "manual_contact" }) },
    );
    expect(res.status).toBe(200);

    // Update targeted the right kind with the new values.
    const updateArg = prisma.emailTemplate.update.mock.calls[0]?.[0] as {
      where: { kind: string };
      data: Record<string, unknown>;
    };
    expect(updateArg.where).toEqual({ kind: "manual_contact" });
    expect(updateArg.data.subjectEn).toBe("New subject");
    expect(updateArg.data.updatedByUserId).toBe("admin-1");

    // Audit written with the stable action code and a diff for each field.
    const auditArg = prisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string; entityType: string; diffJson: Record<string, unknown> };
    };
    expect(auditArg.data.action).toBe("billing.email_template.updated");
    expect(auditArg.data.entityType).toBe("EmailTemplate");
    expect(auditArg.data.diffJson).toMatchObject({
      subjectEn: { old: "Old subject", new: "New subject" },
      bodyEn: { old: "Old body", new: "New body" },
    });
  });
});
