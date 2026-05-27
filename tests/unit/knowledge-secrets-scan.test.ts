import { describe, it, expect } from "vitest";
import { scanSecrets, redactSecrets } from "@/lib/knowledge/secrets-scan";

describe("scanSecrets - positive matches per pattern", () => {
  it("ipv4", () => {
    const findings = scanSecrets("server at 192.168.1.100 is down");
    expect(findings.some((f) => f.pattern === "ipv4")).toBe(true);
  });

  it("iban (IL format)", () => {
    const findings = scanSecrets("send to IL620108000000099999999 thanks");
    expect(findings.some((f) => f.pattern === "iban")).toBe(true);
  });

  it("jwt three-segment", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const findings = scanSecrets(`token=${jwt}`);
    expect(findings.some((f) => f.pattern === "jwt")).toBe(true);
  });

  it("aws_access_key (AKIA prefix)", () => {
    // Literal split across concatenation so GitHub push protection does not
    // flag the test fixture as a real AWS access key while the regex still
    // matches at runtime.
    const fixture = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
    const findings = scanSecrets(`${fixture} is the key`);
    expect(findings.some((f) => f.pattern === "aws_access_key")).toBe(true);
  });

  it("aws_access_key (ASIA prefix)", () => {
    const fixture = "AS" + "IA" + "ABCDEFGHIJKLMNOP";
    const findings = scanSecrets(`${fixture} temp creds`);
    expect(findings.some((f) => f.pattern === "aws_access_key")).toBe(true);
  });

  it("aws_secret with context", () => {
    // 40-char base64-ish blob built via repeat so the source file never
    // contains a contiguous AWS-secret-shaped string.
    const fortyChars = "a".repeat(26) + "B".repeat(14);
    const findings = scanSecrets(`aws_secret_access_key="${fortyChars}"`);
    expect(findings.some((f) => f.pattern === "aws_secret")).toBe(true);
  });

  it("password_phrase", () => {
    const findings = scanSecrets("password: hunter2");
    expect(findings.some((f) => f.pattern === "password_phrase")).toBe(true);
  });

  it("password_phrase Hebrew", () => {
    const findings = scanSecrets("סיסמה: hunter2");
    expect(findings.some((f) => f.pattern === "password_phrase")).toBe(true);
  });

  it("bearer_token", () => {
    const findings = scanSecrets("Authorization: Bearer abcdefghijklmnopqrstuv");
    expect(findings.some((f) => f.pattern === "bearer_token")).toBe(true);
  });

  it("ssh_private_key", () => {
    const findings = scanSecrets(
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...",
    );
    expect(findings.some((f) => f.pattern === "ssh_private_key")).toBe(true);
  });

  it("internal_hostname (skyware-it.local)", () => {
    const findings = scanSecrets("login to dc01.skyware-it.local for that");
    expect(findings.some((f) => f.pattern === "internal_hostname")).toBe(true);
  });
});

describe("scanSecrets - negative cases", () => {
  it("plain prose with no patterns returns empty", () => {
    const findings = scanSecrets(
      "The reseller asked when the contract expires; we should call them back next week.",
    );
    expect(findings).toEqual([]);
  });

  it("does not match a non-AKIA uppercase blob", () => {
    const findings = scanSecrets("XYZABCDEFGHIJKLMNOPQR is not a key");
    expect(findings.some((f) => f.pattern === "aws_access_key")).toBe(false);
  });

  it("does not match a 40-char blob without aws_secret context", () => {
    const fortyChars = "a".repeat(26) + "B".repeat(14);
    const findings = scanSecrets(`${fortyChars} done`);
    expect(findings.some((f) => f.pattern === "aws_secret")).toBe(false);
  });

  it("does not match the word 'bearer' on its own", () => {
    const findings = scanSecrets("the bearer arrived");
    expect(findings.some((f) => f.pattern === "bearer_token")).toBe(false);
  });

  it("does not match a public IP-shaped phrase in a sentence about IPs only when no number tokens present", () => {
    // Negative form: ensure non-IP-shaped text does not match.
    const findings = scanSecrets("we ran one final check this morning");
    expect(findings.some((f) => f.pattern === "ipv4")).toBe(false);
  });

  it("does not match BEGIN PUBLIC KEY", () => {
    const findings = scanSecrets("-----BEGIN PUBLIC KEY-----\n...");
    expect(findings.some((f) => f.pattern === "ssh_private_key")).toBe(false);
  });

  it("does not match a non-skyware FQDN", () => {
    const findings = scanSecrets("see docs.example.com for details");
    expect(findings.some((f) => f.pattern === "internal_hostname")).toBe(false);
  });
});

describe("scanSecrets - preview and offset", () => {
  it("preview is at most 8 chars", () => {
    const findings = scanSecrets("server at 192.168.1.100 is down");
    const f = findings.find((x) => x.pattern === "ipv4")!;
    expect(f.preview.length).toBeLessThanOrEqual(8);
  });

  it("index is the character offset of the match", () => {
    const body = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
    const findings = scanSecrets(body);
    const f = findings.find((x) => x.pattern === "aws_access_key")!;
    expect(f.index).toBe(0);
  });
});

describe("scanSecrets - capped output", () => {
  it("returns at most 200 findings for a pathological input", () => {
    const ip = "1.2.3.4 ";
    const body = ip.repeat(500);
    const findings = scanSecrets(body);
    expect(findings.length).toBeLessThanOrEqual(200);
  });
});

describe("redactSecrets", () => {
  it("replaces matches with [REDACTED:<pattern>] placeholders", () => {
    const { redacted } = redactSecrets("call 10.0.0.1 now");
    expect(redacted).toContain("[REDACTED:ipv4]");
    expect(redacted).not.toContain("10.0.0.1");
  });

  it("returns findings alongside the redacted text", () => {
    const { findings } = redactSecrets("call 10.0.0.1 now");
    expect(findings.length).toBeGreaterThan(0);
  });

  it("returns the original string when there are no findings", () => {
    const { redacted, findings } = redactSecrets("nothing to see here");
    expect(redacted).toBe("nothing to see here");
    expect(findings).toEqual([]);
  });
});
