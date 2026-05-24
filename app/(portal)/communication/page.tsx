import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { listVisibleChannels } from "@/lib/communication/queries";
import { getT } from "@/lib/i18n/server";
import { MessageSquare, Globe, Layers } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  global: Globe,
  helpdesk: Layers,
  it: Layers,
  rnd: Layers,
};

export default async function CommunicationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const channels = await listVisibleChannels(user);
  const { t } = await getT();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageSquare}
        title={t("communication.title")}
        description={t("communication.description")}
      />

      {channels.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t("communication.noChannels")}
          description={t("communication.noChannelsHint")}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {channels.map((ch) => {
            const Icon = CHANNEL_ICONS[ch.key] ?? MessageSquare;
            return (
              <Link
                key={ch.key}
                href={`/communication/${ch.key}`}
                className="group flex items-start gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-brand/40 hover:bg-brand-soft/30"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-brand-soft group-hover:text-brand">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{ch.nameEn}</p>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {ch._count.posts}
                    </span>
                  </div>
                  {ch.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {ch.description}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                    {ch._count.posts === 1
                      ? t("communication.postsOne")
                      : `${ch._count.posts} ${t("communication.postsMany")}`}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
