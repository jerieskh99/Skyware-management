import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { objectKeyFor, sanitizeFilename } from "@/lib/storage/s3";

describe("storage.objectKeyFor", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("places objects under attachments/<yyyy>/<mm>/<id>/<filename>", () => {
    const key = objectKeyFor("00000000-0000-0000-0000-0000000000aa", "photo.JPG");
    expect(key).toBe("attachments/2026/05/00000000-0000-0000-0000-0000000000aa/photo.jpg");
  });

  it("lowercases the extension", () => {
    const key = objectKeyFor("id-1", "Report.PDF");
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("zero-pads the month", () => {
    vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
    const key = objectKeyFor("id-2", "a.png");
    expect(key.startsWith("attachments/2026/01/")).toBe(true);
    vi.setSystemTime(new Date("2026-05-24T10:00:00Z"));
  });
});

describe("storage.sanitizeFilename", () => {
  it("strips forward and back slashes", () => {
    expect(sanitizeFilename("foo/bar.png")).toBe("foo_bar.png");
    expect(sanitizeFilename("foo\\bar.png")).toBe("foo_bar.png");
  });

  it("strips control characters", () => {
    expect(sanitizeFilename("a\x00b.png")).toBe("ab.png");
  });

  it("replaces whitespace with underscores", () => {
    expect(sanitizeFilename("my file.png")).toBe("my_file.png");
  });

  it("falls back to 'file' for empty input after sanitization", () => {
    expect(sanitizeFilename("   ")).toBe("file");
  });

  it("preserves dotless filenames", () => {
    expect(sanitizeFilename("README")).toBe("README");
  });

  it("lowercases only the extension", () => {
    expect(sanitizeFilename("MyReport.PDF")).toBe("MyReport.pdf");
  });

  it("caps length at 200", () => {
    const name = `${"a".repeat(300)}.txt`;
    expect(sanitizeFilename(name).length).toBeLessThanOrEqual(200);
  });
});
