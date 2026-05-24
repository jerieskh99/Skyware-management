"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { NotificationItem } from "./NotificationItem";

interface ApiNotification {
  id: string;
  kind: "sla_breached" | "job_assigned" | "mention";
  payload: Record<string, unknown>;
  link: string | null;
  seenAt: string | null;
  createdAt: string;
}

interface ListResponse {
  items: ApiNotification[];
  unread: number;
}

const POLL_INTERVAL_MS = 60_000;
const QUERY_KEY = ["notifications"] as const;

interface Props {
  featureEnabled: boolean;
}

export function NotificationBell({ featureEnabled }: Props) {
  const { t } = useT();
  const queryClient = useQueryClient();

  const query = useQuery<ListResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=10");
      if (!res.ok) throw new Error("Failed to load notifications");
      return res.json();
    },
    refetchInterval: POLL_INTERVAL_MS,
    enabled: featureEnabled,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark_all_seen" }),
      });
      if (!res.ok) throw new Error("Failed to mark all read");
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seen: true }),
      });
      if (!res.ok) throw new Error("Failed to mark seen");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  if (!featureEnabled) return null;

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;
  const hasUnread = unread > 0;
  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("notifications.bell")}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {hasUnread && (
          <span
            aria-hidden
            className={cn(
              "absolute -end-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-white"
            )}
          >
            {badge}
          </span>
        )}
        <span className="sr-only">
          {hasUnread ? `${unread} ${t("notifications.bell")}` : t("notifications.bell")}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">{t("notifications.title")}</p>
          {hasUnread && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="text-xs text-brand transition-colors hover:underline disabled:opacity-50"
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t("notifications.empty")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationItem
                    id={n.id}
                    kind={n.kind}
                    payload={n.payload}
                    link={n.link}
                    seenAt={n.seenAt}
                    createdAt={n.createdAt}
                    onMarkSeen={(id) => markOne.mutate(id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
