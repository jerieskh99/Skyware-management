import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/search/route";
import { resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

function makeRequest(url: string) {
  return new Request(url);
}

describe("GET /api/search — min length", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
  });

  it("returns 400 when q is too short (single char)", async () => {
    const res = await GET(makeRequest("http://localhost/api/search?q=a&scope=all"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/validation/i);
  });

  it("returns 400 when q is missing", async () => {
    const res = await GET(makeRequest("http://localhost/api/search?scope=all"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthAs(null);
    const res = await GET(makeRequest("http://localhost/api/search?q=abc"));
    expect(res.status).toBe(401);
  });
});
