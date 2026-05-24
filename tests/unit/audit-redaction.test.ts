import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the redact logic directly by extracting it into a testable form.
// This mirrors the logic in lib/audit.ts without needing Prisma.

const REDACTED_FIELDS = new Set([
  "passwordHash",
  "password_hash",
  "password",
  "newPassword",
  "currentPassword",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
]);

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACTED_FIELDS.has(k) ? "[REDACTED]" : v;
  }
  return out;
}

describe("audit redaction", () => {
  it("redacts passwordHash", () => {
    const result = redact({ passwordHash: "bcrypt-hash" });
    expect(result["passwordHash"]).toBe("[REDACTED]");
  });

  it("redacts password_hash", () => {
    const result = redact({ password_hash: "bcrypt-hash" });
    expect(result["password_hash"]).toBe("[REDACTED]");
  });

  it("redacts password", () => {
    const result = redact({ password: "plaintext" });
    expect(result["password"]).toBe("[REDACTED]");
  });

  it("redacts newPassword", () => {
    const result = redact({ newPassword: "secret123" });
    expect(result["newPassword"]).toBe("[REDACTED]");
  });

  it("redacts token and apiKey", () => {
    const result = redact({ token: "abc", apiKey: "xyz" });
    expect(result["token"]).toBe("[REDACTED]");
    expect(result["apiKey"]).toBe("[REDACTED]");
  });

  it("does not redact safe fields", () => {
    const result = redact({ username: "admin.ceo", displayName: "CEO", isActive: true });
    expect(result["username"]).toBe("admin.ceo");
    expect(result["displayName"]).toBe("CEO");
    expect(result["isActive"]).toBe(true);
  });

  it("does not redact null values for safe fields", () => {
    const result = redact({ email: null, notes: null });
    expect(result["email"]).toBeNull();
    expect(result["notes"]).toBeNull();
  });

  it("mixed: redacts sensitive and keeps safe in same object", () => {
    const result = redact({
      username: "admin",
      passwordHash: "hash",
      isActive: true,
      token: "tok123",
    });
    expect(result["username"]).toBe("admin");
    expect(result["passwordHash"]).toBe("[REDACTED]");
    expect(result["isActive"]).toBe(true);
    expect(result["token"]).toBe("[REDACTED]");
  });
});
