/**
 * Renders pre-sanitized HTML produced by `lib/knowledge/markdown.ts`.
 *
 * IMPORTANT: the `html` prop is assumed to come straight from
 * `renderMarkdown(input).html`, which is constructed from a fixed
 * allowlist of tags and is therefore safe for `dangerouslySetInnerHTML`.
 * Callers MUST NOT pass arbitrary user-supplied HTML to this component.
 */
interface Props {
  html: string;
  className?: string;
}

export function MarkdownBody({ html, className = "" }: Props) {
  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className={`knowledge-prose text-sm leading-relaxed text-foreground [&>h1]:mt-6 [&>h1]:mb-3 [&>h1]:text-xl [&>h1]:font-semibold [&>h2]:mt-5 [&>h2]:mb-2 [&>h2]:text-lg [&>h2]:font-semibold [&>h3]:mt-4 [&>h3]:mb-2 [&>h3]:text-base [&>h3]:font-semibold [&>p]:my-2 [&>ul]:my-2 [&>ul]:ms-6 [&>ul]:list-disc [&>ol]:my-2 [&>ol]:ms-6 [&>ol]:list-decimal [&_li]:my-1 [&>pre]:my-3 [&>pre]:overflow-x-auto [&>pre]:rounded-md [&>pre]:bg-muted [&>pre]:p-3 [&>pre]:text-xs [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&>pre_code]:bg-transparent [&>pre_code]:p-0 [&_a]:text-brand [&_a]:underline [&>blockquote]:my-3 [&>blockquote]:border-s-4 [&>blockquote]:border-muted [&>blockquote]:ps-3 [&>blockquote]:text-muted-foreground [&>hr]:my-4 [&>hr]:border-border ${className}`}
    />
  );
}
