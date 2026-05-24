import { describe, it, expect } from "vitest";
import {
  validateUpload,
  isAllowedMime,
  MAX_BYTES,
} from "@/lib/storage/upload-policy";

describe("upload-policy.validateUpload", () => {
  function ok(filename: string, contentType: string, contentLength: number) {
    return validateUpload({ filename, contentType, contentLength });
  }

  it("accepts a small image", () => {
    expect(ok("photo.jpg", "image/jpeg", 100_000)).toEqual({ ok: true });
  });

  it("accepts a PDF", () => {
    expect(ok("report.pdf", "application/pdf", 5_000_000)).toEqual({ ok: true });
  });

  it("accepts a Word docx", () => {
    expect(
      ok(
        "spec.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        100,
      ),
    ).toEqual({ ok: true });
  });

  it("accepts plain text", () => {
    expect(ok("notes.txt", "text/plain", 1024)).toEqual({ ok: true });
  });

  it("accepts a zip archive", () => {
    expect(ok("bundle.zip", "application/zip", 1_000_000)).toEqual({ ok: true });
  });

  it("rejects files at the size limit boundary", () => {
    expect(ok("big.bin", "application/pdf", MAX_BYTES + 1)).toEqual({
      ok: false,
      error: "file_too_large",
    });
  });

  it("accepts files exactly at the size limit", () => {
    expect(ok("big.pdf", "application/pdf", MAX_BYTES)).toEqual({ ok: true });
  });

  it("rejects executable binaries", () => {
    expect(ok("malware.exe", "application/x-msdownload", 100)).toEqual({
      ok: false,
      error: "mime_not_allowed",
    });
  });

  it("rejects empty filename", () => {
    expect(ok("", "image/png", 100)).toEqual({
      ok: false,
      error: "filename_required",
    });
  });

  it("rejects zero-length content", () => {
    expect(ok("a.png", "image/png", 0)).toEqual({
      ok: false,
      error: "content_length_invalid",
    });
  });

  it("rejects negative content length", () => {
    expect(ok("a.png", "image/png", -1)).toEqual({
      ok: false,
      error: "content_length_invalid",
    });
  });

  it("rejects empty content type", () => {
    expect(ok("a.png", "", 100)).toEqual({
      ok: false,
      error: "content_type_required",
    });
  });

  it("rejects filename over 255 chars", () => {
    expect(ok("a".repeat(256) + ".png", "image/png", 100)).toEqual({
      ok: false,
      error: "filename_too_long",
    });
  });

  it("is case-insensitive on MIME", () => {
    expect(isAllowedMime("IMAGE/PNG")).toBe(true);
    expect(isAllowedMime("Application/Pdf")).toBe(true);
  });
});
