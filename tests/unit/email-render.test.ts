import { describe, it, expect } from "vitest";
import type { EmailTemplate } from "@prisma/client";
import {
  escapeHtml,
  renderTemplate,
  renderTemplateHtml,
  renderEmail,
  renderAdHoc,
} from "@/lib/email/render";

describe("renderTemplate (plain text)", () => {
  it("substitutes a single variable", () => {
    expect(renderTemplate("Hello {{name}}", { name: "Dana" })).toBe("Hello Dana");
  });
  it("substitutes multiple variables and repeats", () => {
    expect(
      renderTemplate("{{a}} {{b}} {{a}}", { a: "x", b: "y" }),
    ).toBe("x y x");
  });
  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("Hi {{  name  }}", { name: "Z" })).toBe("Hi Z");
  });
  it("renders unknown variables as empty string (never the literal)", () => {
    expect(renderTemplate("A{{missing}}B", {})).toBe("AB");
  });
  it("renders null and undefined values as empty string", () => {
    expect(renderTemplate("[{{a}}][{{b}}]", { a: null, b: undefined })).toBe("[][]");
  });
  it("coerces numbers to their string form", () => {
    expect(renderTemplate("n={{n}}", { n: 5 })).toBe("n=5");
    expect(renderTemplate("n={{n}}", { n: 0 })).toBe("n=0");
  });
  it("does NOT HTML-escape in the plain-text path", () => {
    expect(renderTemplate("{{v}}", { v: "<b>&" })).toBe("<b>&");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" id='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; id=&#39;y&#39;&gt;&amp;",
    );
  });
  it("escapes ampersand first so entities are not double-escaped wrong", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });
});

describe("renderTemplateHtml (escaping path)", () => {
  it("HTML-escapes interpolated values to prevent injection", () => {
    const out = renderTemplateHtml("Name: {{name}}", {
      name: "<script>alert(1)</script>",
    });
    expect(out).toBe("Name: &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toContain("<script>");
  });
  it("does not escape the literal template text around the variables", () => {
    const out = renderTemplateHtml("<p>{{v}}</p>", { v: "&" });
    expect(out).toBe("<p>&amp;</p>");
  });
});

function makeTemplate(over: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: "t1",
    kind: "manual_contact",
    name: "n",
    subjectEn: "Hello {{client_name}}",
    bodyEn: "Line 1 {{client_name}}\nLine 2",
    subjectHe: "שלום {{client_name}}",
    bodyHe: "שורה 1 {{client_name}}\nשורה 2",
    updatedByUserId: null,
    variableNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as EmailTemplate;
}

describe("renderEmail — language selection", () => {
  it("selects the English subject + body when language=en", () => {
    const r = renderEmail(makeTemplate(), "en", { client_name: "Acme" });
    expect(r.subject).toBe("Hello Acme");
    expect(r.bodyText).toBe("Line 1 Acme\nLine 2");
  });
  it("selects the Hebrew subject + body when language=he", () => {
    const r = renderEmail(makeTemplate(), "he", { client_name: "Acme" });
    expect(r.subject).toBe("שלום Acme");
    expect(r.bodyText).toContain("שורה 1 Acme");
  });
  it("produces an HTML body with newlines turned into <br> and escaped values", () => {
    const r = renderEmail(
      makeTemplate({ bodyEn: "Hi {{client_name}}\nBye" }),
      "en",
      { client_name: "<x>" },
    );
    expect(r.bodyHtml).toBe("Hi &lt;x&gt;<br>\nBye");
    // The plain-text variant keeps the raw value and the raw newline.
    expect(r.bodyText).toBe("Hi <x>\nBye");
  });
  it("renders unknown variables empty in both subject and body", () => {
    const r = renderEmail(
      makeTemplate({ subjectEn: "S {{nope}}", bodyEn: "B {{nope}}" }),
      "en",
      {},
    );
    expect(r.subject).toBe("S ");
    expect(r.bodyText).toBe("B ");
  });
});

describe("renderAdHoc", () => {
  it("renders a verbatim subject + body pair with var interpolation", () => {
    const r = renderAdHoc("Re: {{topic}}", "Body about {{topic}}", {
      topic: "renewal",
    });
    expect(r.subject).toBe("Re: renewal");
    expect(r.bodyText).toBe("Body about renewal");
  });
  it("HTML-escapes values in the ad-hoc HTML body", () => {
    const r = renderAdHoc("s", "{{v}}", { v: "<b>" });
    expect(r.bodyHtml).toBe("&lt;b&gt;");
  });
});
