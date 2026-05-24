import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, mockAuthAs } from "../helpers/session";

// Mock the S3 SDK and presigner so no real AWS call is attempted.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi
    .fn()
    .mockResolvedValue("https://fake-s3.example/upload?sig=x"),
}));

import { POST } from "@/app/api/attachments/route";
import { __resetS3ForTests } from "@/lib/storage/s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const URL = "http://localhost/api/attachments";

function makeRequest(body: unknown) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setEnv() {
  process.env.S3_ENDPOINT = "https://fake-s3.example";
  process.env.S3_REGION = "auto";
  process.env.S3_BUCKET = "test-bucket";
  process.env.S3_ACCESS_KEY_ID = "ak";
  process.env.S3_SECRET_ACCESS_KEY = "sk";
}

describe("POST /api/attachments — policy + presign", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    __resetS3ForTests();
    setEnv();
    mockAuthAs(
      makeEmployeeSession({ department: "helpdesk" }, { id: "u-author" }),
    );
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    vi.mocked(getSignedUrl).mockResolvedValue(
      "https://fake-s3.example/upload?sig=x",
    );
  });

  it("rejects an oversize file with 400", async () => {
    const res = await POST(
      makeRequest({
        filename: "huge.pdf",
        contentType: "application/pdf",
        contentLength: 100 * 1024 * 1024,
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("file_too_large");
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it("rejects a disallowed MIME with 400", async () => {
    const res = await POST(
      makeRequest({
        filename: "bad.exe",
        contentType: "application/x-msdownload",
        contentLength: 100,
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("mime_not_allowed");
  });

  it("creates a row and returns a presigned URL for an allowed file", async () => {
    const id = "00000000-0000-0000-0000-0000000000a1";
    prisma.attachment.create.mockResolvedValueOnce({
      id,
      storageKey: "",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      byteSize: 100,
      uploadedByUserId: "u-author",
      visibility: "public_in_org",
      createdAt: new Date(),
    });
    prisma.attachment.update.mockResolvedValueOnce({
      id,
      storageKey: "attachments/2026/05/" + id + "/photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      byteSize: 100,
      uploadedByUserId: "u-author",
      visibility: "public_in_org",
      createdAt: new Date(),
    });
    prisma.auditLog.create.mockResolvedValueOnce({ id: "audit-1" });

    const res = await POST(
      makeRequest({
        filename: "photo.jpg",
        contentType: "image/jpeg",
        contentLength: 100,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      key: string;
      presignedUrl: string;
      headers: Record<string, string>;
    };
    expect(body.id).toBe(id);
    expect(body.presignedUrl).toBe("https://fake-s3.example/upload?sig=x");
    expect(body.headers["Content-Type"]).toBe("image/jpeg");
    expect(prisma.attachment.create).toHaveBeenCalledTimes(1);
    expect(prisma.attachment.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when there is no session", async () => {
    mockAuthAs(null);
    const res = await POST(
      makeRequest({
        filename: "a.png",
        contentType: "image/png",
        contentLength: 1,
      }),
    );
    expect(res.status).toBe(401);
  });
});
