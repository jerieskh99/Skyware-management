import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import {
  makeAdminSession,
  makeEmployeeSession,
  mockAuthAs,
} from "../helpers/session";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi
    .fn()
    .mockResolvedValue("https://fake-s3.example/download?sig=x"),
}));

import { GET } from "@/app/api/attachments/[id]/route";
import { __resetS3ForTests } from "@/lib/storage/s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ATTACHMENT_ID = "00000000-0000-0000-0000-0000000000aa";

function makeRequest() {
  return new Request(`http://localhost/api/attachments/${ATTACHMENT_ID}`);
}

function makeParams() {
  return { params: Promise.resolve({ id: ATTACHMENT_ID }) };
}

function setEnv() {
  process.env.S3_ENDPOINT = "https://fake-s3.example";
  process.env.S3_BUCKET = "bkt";
  process.env.S3_ACCESS_KEY_ID = "ak";
  process.env.S3_SECRET_ACCESS_KEY = "sk";
}

describe("GET /api/attachments/[id] — visibility gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    __resetS3ForTests();
    setEnv();
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    vi.mocked(getSignedUrl).mockResolvedValue(
      "https://fake-s3.example/download?sig=x",
    );
  });

  it("returns 403 for an admin_only attachment when caller is not admin", async () => {
    mockAuthAs(
      makeEmployeeSession({ department: "helpdesk" }, { id: "emp-1" }),
    );
    prisma.attachment.findUnique.mockResolvedValueOnce({
      id: ATTACHMENT_ID,
      storageKey: "attachments/2026/05/x/a.pdf",
      fileName: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 100,
      visibility: "admin_only",
    });
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 200 with a presigned URL for an admin_only attachment when caller is admin", async () => {
    mockAuthAs(makeAdminSession());
    prisma.attachment.findUnique.mockResolvedValueOnce({
      id: ATTACHMENT_ID,
      storageKey: "attachments/2026/05/x/a.pdf",
      fileName: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 100,
      visibility: "admin_only",
    });
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; visibility: string };
    expect(body.url).toContain("download?sig=");
    expect(body.visibility).toBe("admin_only");
  });

  it("returns 200 for a public_in_org attachment to any logged-in user", async () => {
    mockAuthAs(
      makeEmployeeSession({ department: "it" }, { id: "emp-2" }),
    );
    prisma.attachment.findUnique.mockResolvedValueOnce({
      id: ATTACHMENT_ID,
      storageKey: "attachments/2026/05/x/b.png",
      fileName: "b.png",
      mimeType: "image/png",
      byteSize: 100,
      visibility: "public_in_org",
    });
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
  });

  it("returns 404 when the attachment does not exist", async () => {
    mockAuthAs(makeAdminSession());
    prisma.attachment.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 401 when no session", async () => {
    mockAuthAs(null);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });
});
