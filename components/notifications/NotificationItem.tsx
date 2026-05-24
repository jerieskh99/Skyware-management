"use client";

import { AlertTriangle, AtSign, Briefcase } from "lucide-react";
import type { NotificationKind } from "@prisma/client";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface NotificationItemProps {
  id: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  link: string | null;
  seenAt: string | null;
  createdAt: string;
  onMarkSeen: (id: string) => void;
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  const cls = "h-4 w-4 shrink-0";
  if (kind === "job_assigned") return <Briefcase className={cls} aria-hidden />;
  if (kind === "mention") return <AtSign className={cls} aria-hidden />;
  return <AlertTriangle className={cls} aria-hidden />;
}

function relativeTime(iso: string, t: (key: string) => string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return t("notifications.relativeTime.justNow");
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    return t("notifications.relativeTime.minutesAgo").replace("{n}", String(diffMin));
  }
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) {
    return t("notifications.relativeTime.hoursAgo").replace("{n}", String(diffHr));
  }
  const diffDay = Math.round(diffHr / 24);
  return t("notifications.relativeTime.daysAgo").replace("{n}", String(diffDay));
}

function describe(
  kind: NotificationKind,
  payload: Record<string, unknown>,
  t: (key: string) => string
): string {
  if (kind === "job_assigned") {
    const num = String(payload["publicNumber"] ?? "");
    return t("notifications.assignedYou").replace("{publicNumber}", num);
  }
  if (kind === "mention") {
    const ch = String(payload["channelKey"] ?? "");
    return t("notifications.mentionedYou").replace("{channel}", ch);
  }
  // sla_breached
  const num = String(payload["publicNumber"] ?? "");
  return t("notifications.slaBreach").replace("{publicNumber}", num);
}

export function NotificationItem(props: NotificationItemProps) {
  const { id, kind, payload, link, seenAt, createdAt, onMarkSeen } = props;
  const { t } = useT();
  const unread = !seenAt;
  const message = describe(kind, payload, t);
  const stamp = relativeTime(createdAt, t);

  const inner = (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 text-muted-foreground">
        <KindIcon kind={kind} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", unread && "font-medium")}>{message}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{stamp}</p>
      </div>
      {unread && (
        <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
      )}
    </div>
  );

  const className = cn(
    "block w-full rounded-md border-l-2 px-3 py-2 text-start transition-colors hover:bg-accent",
    unread ? "border-l-brand" : "border-l-transparent"
  );

  function handleClick() {
    if (unread) onMarkSeen(id);
  }

  if (link) {
    return (
      <a href={link} className={className} onClick={handleClick}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={handleClick}>
      {inner}
    </button>
  );
}
