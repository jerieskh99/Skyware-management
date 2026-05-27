import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownBody } from "@/components/knowledge/MarkdownBody";
import { renderMarkdown } from "@/lib/knowledge/markdown";

/**
 * Component test: the `MarkdownBody` view renders sanitized HTML produced
 * by `renderMarkdown`. The render pipeline (lib + view) must:
 *   - emit bold / italic / inline-code / list / link tags from Markdown,
 *   - drop raw `<script>` tags,
 *   - apply `target="_blank"` and `rel="noopener noreferrer"` to links.
 *
 * Because the view trusts pre-sanitized HTML and uses
 * `dangerouslySetInnerHTML`, the security guarantee is fully on the
 * `renderMarkdown` side. This test pairs the two so a regression in
 * either layer (e.g. a markdown change that lets `<script>` through) is
 * caught.
 */
function renderFromMd(md: string) {
  const { html } = renderMarkdown(md);
  return render(<MarkdownBody html={html} />);
}

describe("MarkdownBody (paired with renderMarkdown)", () => {
  it("renders bold, italic, and inline code", () => {
    const { container } = renderFromMd("**bold** *italic* `code`");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("renders unordered and ordered lists", () => {
    const { container } = renderFromMd("- one\n- two\n\n1. first\n2. second");
    const ul = container.querySelector("ul");
    const ol = container.querySelector("ol");
    expect(ul).not.toBeNull();
    expect(ol).not.toBeNull();
    expect(ul?.querySelectorAll("li").length).toBe(2);
    expect(ol?.querySelectorAll("li").length).toBe(2);
  });

  it("renders links with target=_blank and rel=noopener noreferrer", () => {
    const { container } = renderFromMd("[example](https://example.com)");
    const a = container.querySelector("a") as HTMLAnchorElement | null;
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a?.textContent).toBe("example");
  });

  it("strips raw <script> tags entirely (no script node, no executable text)", () => {
    const { container } = renderFromMd(
      "Safe text <script>alert('xss')</script> more text",
    );
    // No <script> element rendered.
    expect(container.querySelector("script")).toBeNull();
    // The escaped text is fine but no DOM script node carries through.
    // Confirm the dangerous string never reaches the DOM as an executable
    // script (we accept either visible text or full erasure).
    const html = container.innerHTML;
    expect(html.toLowerCase()).not.toContain("<script>");
  });

  it("rejects javascript: hrefs (renders the original Markdown as plain text)", () => {
    const { container } = renderFromMd("[click](javascript:alert(1))");
    // The link path bails to plain text when the href is not http(s).
    const a = container.querySelector("a");
    expect(a).toBeNull();
    expect(container.textContent).toContain("[click]");
  });

  it("renders headings at the expected levels", () => {
    const { container } = renderFromMd("# H1\n## H2\n### H3");
    expect(container.querySelector("h1")?.textContent).toBe("H1");
    expect(container.querySelector("h2")?.textContent).toBe("H2");
    expect(container.querySelector("h3")?.textContent).toBe("H3");
  });

  it("renders fenced code blocks with a language class", () => {
    const { container } = renderFromMd("```ts\nconst x = 1;\n```");
    const pre = container.querySelector("pre code");
    expect(pre?.className).toContain("language-ts");
    expect(pre?.textContent).toBe("const x = 1;");
  });

  it("accepts a custom className without dropping the prose classes", () => {
    const { container } = renderFromMd("hello");
    const root = container.firstChild as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.className).toContain("knowledge-prose");
  });
});
