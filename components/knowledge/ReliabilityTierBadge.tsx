"use client";

import type { KnowledgeReliabilityTier } from "@prisma/client";
import { useT } from "@/lib/i18n/client";
import { InfoTooltip } from "@/components/ui/tooltip";

const TIER_STYLES: Record<KnowledgeReliabilityTier, string> = {
  verified:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  validated:     "bg-blue-50 text-blue-700 border-blue-200",
  single_source: "bg-muted text-muted-foreground border-border",
  anecdotal:     "bg-amber-50 text-amber-700 border-amber-200",
};

interface Props {
  tier: KnowledgeReliabilityTier;
  className?: string;
}

export function ReliabilityTierBadge({ tier, className = "" }: Props) {
  const { t } = useT();
  const cls = TIER_STYLES[tier] ?? TIER_STYLES.single_source;
  const label = t(`knowledge.reliability.${tier}`);
  const help = t(`knowledge.reliability.${tier}Help`);
  return (
    <InfoTooltip label={help}>
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls} ${className}`}
      >
        {label}
      </span>
    </InfoTooltip>
  );
}
