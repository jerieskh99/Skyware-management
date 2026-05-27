import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/lib/knowledge/markdown";

describe("renderMarkdown - safe HTML output", () => {
  it("renders headings", () => {
    const { html } = renderMarkdown("# Title\n\n## Subtitle");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Subtitle</h2>");
  });

  it("renders paragraphs", () => {
    const { html } = renderMarkdown("First paragraph.\n\nSecond paragraph.");
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
  });

  it("renders bold and italic", () => {
    const { html } = renderMarkdown("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders inline code", () => {
    const { html } = renderMarkdown("Use `npm install`");
    expect(html).toContain("<code>npm install</code>");
  });

  it("renders fenced code blocks with language class", () => {
    const { html } = renderMarkdown("```bash\nls -la\n```");
    expect(html).toContain('<pre><code class="language-bash">ls -la</code></pre>');
  });

  it("renders unordered lists", () => {
    const { html } = renderMarkdown("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>three</li>");
  });

  it("renders ordered lists", () => {
    const { html } = renderMarkdown("1. one\n2. two");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("renders blockquotes", () => {
    const { html } = renderMarkdown("> a quote");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("a quote");
  });

  it("renders horizontal rules", () => {
    const { html } = renderMarkdown("text\n\n---\n\ntext");
    expect(html).toContain("<hr />");
  });
});

describe("renderMarkdown - safe links", () => {
  it("renders http(s) links with rel=noopener", () => {
    const { html, linkCount } = renderMarkdown("[a](https://example.com/)");
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(linkCount).toBe(1);
  });

  it("drops javascript: links - no <a> emitted", () => {
    const { html, linkCount } = renderMarkdown("[a](javascript:alert(1))");
    // The link is not promoted to an anchor; the source markdown is left
    // as escaped text instead.
    expect(html).not.toContain("<a ");
    expect(html).not.toContain('href="javascript:');
    expect(linkCount).toBe(0);
  });

  it("drops data: links - no <a> emitted", () => {
    const { html, linkCount } = renderMarkdown("[a](data:text/html,xyz)");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain('href="data:');
    expect(linkCount).toBe(0);
  });
});

describe("renderMarkdown - XSS sanitization", () => {
  it("escapes raw <script> tags", () => {
    const { html } = renderMarkdown("Hello <script>alert(1)</script> world");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes raw <img onerror=> attempts", () => {
    const { html } = renderMarkdown('<img src=x onerror="alert(1)" />');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("escapes html in inline code", () => {
    const { html } = renderMarkdown("`<script>x</script>`");
    expect(html).toContain("<code>&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("escapes html in fenced code blocks", () => {
    const { html } = renderMarkdown("```\n<script>alert(1)</script>\n```");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("strips bidi-override unicode characters", () => {
    const evil = "user‮gnp.exe"; // RLO trick
    const { html } = renderMarkdown(evil);
    expect(html).not.toContain("‮");
  });

  it("escapes < and > in plain paragraphs", () => {
    const { html } = renderMarkdown("a < b and b > a");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
  });
});

describe("renderMarkdown - text preview and link counts", () => {
  it("textPreview strips tags", () => {
    const { textPreview } = renderMarkdown("# Title\n\nSome **bold** text.");
    expect(textPreview).not.toContain("<");
    expect(textPreview).toContain("Title");
    expect(textPreview).toContain("Some bold text.");
  });

  it("textPreview is capped at 280 chars", () => {
    const long = "word ".repeat(200); // ~1000 chars
    const { textPreview } = renderMarkdown(long);
    expect(textPreview.length).toBeLessThanOrEqual(280);
  });

  it("counts links across the body", () => {
    const { linkCount } = renderMarkdown(
      "[a](https://a.com) and [b](https://b.com)",
    );
    expect(linkCount).toBe(2);
  });

  it("handles empty input", () => {
    const result = renderMarkdown("");
    expect(result.html).toBe("");
    expect(result.textPreview).toBe("");
    expect(result.linkCount).toBe(0);
  });
});
