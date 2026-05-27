import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { KnowledgeArticleType } from "@prisma/client";
import { ArticleKindChip } from "@/components/knowledge/ArticleKindChip";
import { LocaleProvider } from "@/lib/i18n/client";

/**
 * Component test: one chip per `KnowledgeArticleType`. The chip MUST render
 * the localized label (per the i18n key `knowledge.kinds.<kind>`) and a
 * per-kind tone class so the visual hierarchy in the list / detail header is
 * deterministic and screen-readers see human-readable text rather than a
 * raw enum.
 *
 * The dict we pass is the minimum surface the chip queries. We deliberately
 * don't load the full `en.json` so the test fails noisily if a key the
 * chip relies on disappears.
 */
const dict = {
  knowledge: {
    kinds: {
      internal_task_lesson: "Internal task lesson",
      external_reference: "External reference",
      how_to_guide: "How-to guide",
      troubleshooting_note: "Troubleshooting note",
      architecture_decision: "Architecture decision",
      process_policy_note: "Process / policy note",
    },
  },
} as unknown as Parameters<typeof LocaleProvider>[0]["dict"];

/** Tone-class fragment we expect per kind. The chip resolves an extra
 *  background/border but the text-* color is the most stable signal. */
const EXPECTED_TONE: Record<KnowledgeArticleType, string> = {
  internal_task_lesson: "text-violet-700",
  external_reference: "text-blue-700",
  how_to_guide: "text-emerald-700",
  troubleshooting_note: "text-amber-700",
  architecture_decision: "text-indigo-700",
  process_policy_note: "text-slate-700",
};

const ALL_KINDS = Object.keys(EXPECTED_TONE) as KnowledgeArticleType[];

describe("ArticleKindChip", () => {
  for (const kind of ALL_KINDS) {
    it(`renders the localized label and tone for kind=${kind}`, () => {
      render(
        <LocaleProvider locale="en" dict={dict}>
          <ArticleKindChip kind={kind} />
        </LocaleProvider>,
      );
      const label = dict.knowledge.kinds[kind];
      const node = screen.getByText(label);
      expect(node).toBeInTheDocument();
      expect(node.className).toContain(EXPECTED_TONE[kind]);
    });
  }

  it("forwards the className prop without overriding tone classes", () => {
    render(
      <LocaleProvider locale="en" dict={dict}>
        <ArticleKindChip kind="how_to_guide" className="custom-x" />
      </LocaleProvider>,
    );
    const node = screen.getByText(dict.knowledge.kinds.how_to_guide);
    expect(node.className).toContain("custom-x");
    expect(node.className).toContain(EXPECTED_TONE.how_to_guide);
  });
});
