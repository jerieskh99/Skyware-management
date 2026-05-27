import { describe, it, expect } from "vitest";
import {
  canonicalizeUrl,
  hashCanonicalUrl,
  isAcceptableExternalUrl,
  InvalidExternalUrlError,
} from "@/lib/knowledge/url";

describe("canonicalizeUrl - scheme + host normalization", () => {
  it("lowercases scheme and host", () => {
    expect(canonicalizeUrl("HTTPS://EXAMPLE.COM/Path"))
      .toBe("https://example.com/Path");
  });

  it("strips www. prefix", () => {
    expect(canonicalizeUrl("https://www.example.com/")).toBe("https://example.com/");
  });

  it("strips default port (https:443)", () => {
    expect(canonicalizeUrl("https://example.com:443/")).toBe("https://example.com/");
  });

  it("strips default port (http:80)", () => {
    expect(canonicalizeUrl("http://example.com:80/")).toBe("http://example.com/");
  });

  it("preserves non-default port", () => {
    expect(canonicalizeUrl("https://example.com:8443/api"))
      .toBe("https://example.com:8443/api");
  });
});

describe("canonicalizeUrl - query handling", () => {
  it("sorts query params alphabetically", () => {
    expect(canonicalizeUrl("https://example.com/?b=2&a=1&c=3"))
      .toBe("https://example.com/?a=1&b=2&c=3");
  });

  it("drops utm_* tracking params", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/p?utm_source=newsletter&utm_medium=email&id=42",
      ),
    ).toBe("https://example.com/p?id=42");
  });

  it("drops fbclid, gclid, ref", () => {
    expect(
      canonicalizeUrl("https://example.com/p?fbclid=abc&gclid=def&ref=xyz&id=42"),
    ).toBe("https://example.com/p?id=42");
  });
});

describe("canonicalizeUrl - fragment handling", () => {
  it("drops fragments", () => {
    expect(canonicalizeUrl("https://example.com/p#section-3"))
      .toBe("https://example.com/p");
  });
});

describe("canonicalizeUrl - scheme rejection", () => {
  it("rejects javascript:", () => {
    expect(() => canonicalizeUrl("javascript:alert(1)")).toThrow(
      InvalidExternalUrlError,
    );
  });

  it("rejects data:", () => {
    expect(() => canonicalizeUrl("data:text/html,<x>")).toThrow(
      InvalidExternalUrlError,
    );
  });

  it("rejects file:", () => {
    expect(() => canonicalizeUrl("file:///etc/passwd")).toThrow(
      InvalidExternalUrlError,
    );
  });

  it("rejects malformed urls", () => {
    expect(() => canonicalizeUrl("not a url at all")).toThrow(
      InvalidExternalUrlError,
    );
  });

  it("rejects blank input", () => {
    expect(() => canonicalizeUrl("")).toThrow(InvalidExternalUrlError);
    expect(() => canonicalizeUrl("   ")).toThrow(InvalidExternalUrlError);
  });
});

describe("canonicalizeUrl - idempotence and determinism", () => {
  it("is idempotent: canonical(canonical(x)) === canonical(x)", () => {
    const once = canonicalizeUrl("HTTPS://WWW.Example.com:443/path?b=2&a=1#frag");
    const twice = canonicalizeUrl(once);
    expect(twice).toBe(once);
  });

  it("two equivalent URLs canonicalize to the same string", () => {
    const a = canonicalizeUrl("https://www.example.com/p?b=2&a=1&utm_source=x");
    const b = canonicalizeUrl("HTTPS://example.com:443/p?a=1&b=2#frag");
    expect(a).toBe(b);
  });
});

describe("hashCanonicalUrl", () => {
  it("is deterministic", () => {
    const a = hashCanonicalUrl("https://example.com/?b=2&a=1");
    const b = hashCanonicalUrl("https://example.com/?b=2&a=1");
    expect(a).toBe(b);
  });

  it("produces the same hash for equivalent URLs", () => {
    const a = hashCanonicalUrl("https://www.example.com/?utm_source=x&b=2&a=1");
    const b = hashCanonicalUrl("HTTPS://example.com:443/?a=1&b=2");
    expect(a).toBe(b);
  });

  it("produces different hashes for different URLs", () => {
    const a = hashCanonicalUrl("https://example.com/path1");
    const b = hashCanonicalUrl("https://example.com/path2");
    expect(a).not.toBe(b);
  });

  it("returns a 64-character lowercase hex string (sha-256)", () => {
    const h = hashCanonicalUrl("https://example.com/");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isAcceptableExternalUrl", () => {
  it("accepts https", () => {
    expect(isAcceptableExternalUrl("https://example.com/")).toBe(true);
  });
  it("accepts http", () => {
    expect(isAcceptableExternalUrl("http://example.com/")).toBe(true);
  });
  it("rejects javascript:", () => {
    expect(isAcceptableExternalUrl("javascript:alert(1)")).toBe(false);
  });
  it("rejects null and empty", () => {
    expect(isAcceptableExternalUrl(null)).toBe(false);
    expect(isAcceptableExternalUrl("")).toBe(false);
  });
});
