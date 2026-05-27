import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { KnowledgeReliabilityTier } from "@prisma/client";
import { ReliabilityTierBadge } from "@/components/knowledge/ReliabilityTierBadge";
import { LocaleProvider } from "@/lib/i18n/client";

/**
 * Component test: one badge per `KnowledgeReliabilityTier`. The badge
 * MUST render the localized label and expose the localized help text as
 * the tooltip trigger's `aria-label` (Radix `InfoTooltip` puts the help
 * string there so screen-readers receive it without the tooltip needing
 * to open).
 */
const dict = {
  knowledge: {
    reliability: {
      verified: "Verified",
      verifiedHelp:
        "Independently verified by at least two senior engineers.",
      validated: "Validated",
      validatedHelp: "Reviewed and considered correct, but only one validator.",
      single_source: "Single source",
      single_sourceHelp: "Drawn from one source. Treat with care.",
      anecdotal: "Anecdotal",
      anecdotalHelp: "Worker writeup. Useful, but unverified.",
    },
  },
} as unknown as Parameters<typeof LocaleProvider>[0]["dict"];

const EXPECTED_TONE: Record<KnowledgeReliabilityTier, string> = {
  verified: "text-emerald-700",
  validated: "text-blue-700",
  single_source: "text-muted-foreground",
  anecdotal: "text-amber-700",
};

const ALL_TIERS = Object.keys(EXPECTED_TONE) as KnowledgeReliabilityTier[];

describe("ReliabilityTierBadge", () => {
  for (const tier of ALL_TIERS) {
    it(`renders label, tone, and tooltip help for tier=${tier}`, () => {
      render(
        <LocaleProvider locale="en" dict={dict}>
          <ReliabilityTierBadge tier={tier} />
        </LocaleProvider>,
      );
      const label = dict.knowledge.reliability[tier];
      const help =
        dict.knowledge.reliability[
          `${tier}Help` as keyof typeof dict.knowledge.reliability
        ];

      const node = screen.getByText(label);
      expect(node).toBeInTheDocument();
      expect(node.className).toContain(EXPECTED_TONE[tier]);

      // Radix InfoTooltip puts the help text on the trigger's aria-label
      // so it is announced without hover. Confirm at least one element in
      // the DOM has that aria-label exactly.
      const triggers = screen.getAllByLabelText(help);
      expect(triggers.length).toBeGreaterThan(0);
    });
  }
});
