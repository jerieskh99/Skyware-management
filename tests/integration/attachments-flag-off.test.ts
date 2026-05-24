import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://fake/x"),
}));

import { POST } from "@/app/api/attachments/route";

const URL = "http://localhost/api/attachments";

function makeRequest(body: unknown) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/attachments — feature flag off", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(
      makeEmployeeSession({ department: "helpdesk" }, { id: "u-1" }),
    );
  });

  it("returns 503 when attachments_enabled is false", async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });
    const res = await POST(
      makeRequest({
        filename: "a.png",
        contentType: "image/png",
        contentLength: 100,
      }),
    );
    expect(res.status).toBe(503);
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it("returns 503 when the flag row does not exist", async () => {
    prisma.featureFlag.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeRequest({
        filename: "a.png",
        contentType: "image/png",
        contentLength: 100,
      }),
    );
    expect(res.status).toBe(503);
  });
});
