import Link from "next/link";
import { Link2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { getT } from "@/lib/i18n/server";
import { formatTz, timeAgo } from "@/lib/time";
import type { JobDetail } from "@/lib/jobs/queries";

interface Props {
  job: JobDetail;
}

export async function JobRelatedTab({ job }: Props) {
  const { t } = await getT();
  const posts = job.relatedPosts ?? [];
  const payment = job.linkedPayment ?? null;

  if (posts.length === 0 && !payment) {
    return <EmptyState icon={Link2} title={t("jobs.detail.noRelated")} />;
  }

  return (
    <div className="space-y-6">
      {payment && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {t("jobs.detail.linkedPayment")}
          </h2>
          <Link
            href={`/billing?payment=${payment.id}`}
            className="block rounded-lg border p-3 text-sm hover:bg-accent"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {payment.amountPlaceholder != null
                  ? `${payment.amountPlaceholder} ${payment.currency}`
                  : payment.currency}
              </span>
              <span className="text-xs text-muted-foreground">{payment.status}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Issued {formatTz(new Date(payment.issuedDate))}
              {payment.dueDate && (
                <> · Due {formatTz(new Date(payment.dueDate))}</>
              )}
            </div>
          </Link>
        </section>
      )}

      {posts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {t("jobs.detail.relatedPosts")}
          </h2>
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/communication/${p.channel.key}/${p.id}`}
                  className="block rounded-lg border p-3 text-sm hover:bg-accent"
                >
                  <div className="font-medium">{p.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {p.author.displayName} ·{" "}
                    <span title={formatTz(new Date(p.createdAt))}>
                      {timeAgo(new Date(p.createdAt))}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
