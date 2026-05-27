import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { KnowledgeArticleStatus } from "@prisma/client";
import { ArticleStatusChip } from "@/components/knowledge/ArticleStatusChip";
import { LocaleProvider } from "@/lib/i18n/client";

/**
 * Component test: one chip per `KnowledgeArticleStatus`. The chip MUST
 * render the localized label (per the i18n key `knowledge.statuses.<status>`)
 * and a per-status tone class. `archived` additionally renders a
 * line-through so the chip is visually weaker.
 */
const dict = {
  knowledge: {
    statuses: {
      draft: "Draft",
      ai_structured: "AI structured",
      pending_review: "Pending review",
      approved: "Approved",
      published: "Published",
      archived: "Archived",
    },
  },
} as unknown as Parameters<typeof LocaleProvider>[0]["dict"];

/** Tone fragment per status. `draft` and `archived` share the same muted
 *  family, but `archived` adds `line-through` so we assert that too. */
const EXPECTED_TONE: Record<KnowledgeArticleStatus, string> = {
  draft: "text-muted-foreground",
  ai_structured: "text-fuchsia-700",
  pending_review: "text-amber-700",
  approved: "text-blue-700",
  published: "text-green-700",
  archived: "text-muted-foreground/60",
};

const ALL_STATUSES = Object.keys(EXPECTED_TONE) as KnowledgeArticleStatus[];

describe("ArticleStatusChip", () => {
  for (const status of ALL_STATUSES) {
    it(`renders label and tone for status=${status}`, () => {
      render(
        <LocaleProvider locale="en" dict={dict}>
          <ArticleStatusChip status={status} />
        </LocaleProvider>,
      );
      const label = dict.knowledge.statuses[status];
      const node = screen.getByText(label);
      expect(node).toBeInTheDocument();
      expect(node.className).toContain(EXPECTED_TONE[status]);
    });
  }

  it("renders the archived state with a line-through decoration", () => {
    render(
      <LocaleProvider locale="en" dict={dict}>
        <ArticleStatusChip status="archived" />
      </LocaleProvider>,
    );
    const node = screen.getByText("Archived");
    expect(node.className).toContain("line-through");
  });

  it("forwards a custom className alongside the tone classes", () => {
    render(
      <LocaleProvider locale="en" dict={dict}>
        <ArticleStatusChip status="published" className="extra-class" />
      </LocaleProvider>,
    );
    const node = screen.getByText("Published");
    expect(node.className).toContain("extra-class");
    expect(node.className).toContain(EXPECTED_TONE.published);
  });
});
