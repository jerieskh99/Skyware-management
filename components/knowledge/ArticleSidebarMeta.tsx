"use client";

import Link from "next/link";
import type { KnowledgeReliabilityTier } from "@prisma/client";
import { useT } from "@/lib/i18n/client";
import { ReliabilityTierBadge } from "./ReliabilityTierBadge";
import { VerifiedFreshnessPill } from "./VerifiedFreshnessPill";

interface Props {
  author: { id: string; displayName: string } | null;
  reviewer: { id: string; displayName: string } | null;
  lastVerifiedBy?: { id: string; displayName: string } | null;
  lastVerifiedAt: Date | string | null;
  reliabilityTier: KnowledgeReliabilityTier;
  sourceJob?: { id: string; publicNumber: string; title: string } | null;
  /**
   * Server-resolved route for the linked source job: `/my-jobs/[id]` for
   * the assignee, `/global-jobs/[id]` for everyone else. Required when
   * `sourceJob` is set; the parent page resolves it via a single
   * `Job.assignedEmployeeId` lookup so this component stays a leaf client.
   */
  sourceJobHref?: string | null;
  externalSource?: string | null;
  externalUrl?: string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
}

function fmtDate(d: Date | string | null, locale: "he" | "en"): string {
  if (d === null) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(locale === "he" ? "he-IL" : "en-US");
}

export function ArticleSidebarMeta({
  author,
  reviewer,
  lastVerifiedBy,
  lastVerifiedAt,
  reliabilityTier,
  sourceJob,
  sourceJobHref,
  externalSource,
  externalUrl,
  updatedAt,
  createdAt,
}: Props) {
  const { t, locale } = useT();

  return (
    <aside className="space-y-4 rounded-xl border bg-card p-4 text-sm">
      <header>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("knowledge.detail.summary.metadataHeading")}
        </h2>
      </header>

      <div className="space-y-2">
        <Row
          label={t("knowledge.detail.summary.reliability")}
          value={<ReliabilityTierBadge tier={reliabilityTier} />}
        />
        <Row
          label={t("knowledge.detail.summary.freshness")}
          value={<VerifiedFreshnessPill lastVerifiedAt={lastVerifiedAt} />}
        />
        <Row
          label={t("knowledge.detail.summary.author")}
          value={author?.displayName ?? "—"}
        />
        <Row
          label={t("knowledge.detail.summary.reviewer")}
          value={reviewer?.displayName ?? "—"}
        />
        <Row
          label={t("knowledge.detail.summary.lastVerifiedBy")}
          value={lastVerifiedBy?.displayName ?? "—"}
        />
        <Row
          label={t("knowledge.detail.summary.created")}
          value={fmtDate(createdAt, locale)}
        />
        <Row
          label={t("knowledge.detail.summary.updated")}
          value={fmtDate(updatedAt, locale)}
        />
      </div>

      {sourceJob && sourceJobHref && (
        <div className="space-y-1 border-t pt-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("knowledge.detail.summary.sourceJobLink")}
          </p>
          <Link
            href={sourceJobHref}
            className="block truncate text-sm font-medium text-brand hover:underline"
          >
            {sourceJob.publicNumber}
            <span className="ms-1 text-muted-foreground">{sourceJob.title}</span>
          </Link>
        </div>
      )}

      {externalUrl && (
        <div className="space-y-1 border-t pt-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {externalSource ?? t("knowledge.detail.summary.externalSource")}
          </p>
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-brand hover:underline"
            dir="ltr"
          >
            {externalUrl}
          </a>
        </div>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-end text-sm font-medium">{value}</dd>
    </div>
  );
}
