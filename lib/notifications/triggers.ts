import type { Prisma } from "@prisma/client";
import { getFeatureFlag } from "@/lib/feature-flags";

/**
 * Notification trigger helpers.
 *
 * Each helper is a no-op when the `notifications_enabled` feature flag is off.
 * Writes go through the caller-supplied Prisma transaction client so the row
 * lands inside the same transaction as the originating mutation (job assign,
 * post create, etc.) — either everything commits, or nothing does.
 *
 * Phase 3 will add the scheduled writer for `notifySlaBreached`. The function
 * is exported now so the trigger surface is complete and call sites that learn
 * of breaches can use it without follow-up wiring.
 */

const FLAG_KEY = "notifications_enabled";

interface JobAssignedArgs {
  userId: string;
  jobId: string;
  publicNumber: string;
  title: string;
}

export async function notifyJobAssigned(
  tx: Prisma.TransactionClient,
  args: JobAssignedArgs
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;
  await tx.notification.create({
    data: {
      userId: args.userId,
      kind: "job_assigned",
      payload: {
        jobId: args.jobId,
        publicNumber: args.publicNumber,
        title: args.title,
      } satisfies Prisma.InputJsonValue,
      link: `/my-jobs/${args.jobId}`,
    },
  });
}

interface MentionArgs {
  userId: string;
  postId: string;
  replyId?: string;
  channelKey: string;
}

export async function notifyMention(
  tx: Prisma.TransactionClient,
  args: MentionArgs
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;
  const payload: Record<string, string> = {
    postId: args.postId,
    channelKey: args.channelKey,
  };
  if (args.replyId) payload["replyId"] = args.replyId;
  await tx.notification.create({
    data: {
      userId: args.userId,
      kind: "mention",
      payload: payload as Prisma.InputJsonValue,
      link: `/communication/${args.channelKey}/${args.postId}`,
    },
  });
}

interface SlaBreachedArgs {
  userId: string;
  jobId: string;
  publicNumber: string;
  breachMinutes: number;
}

/**
 * Writer for `sla_breached`. Exposed in Phase 2 so the surface is complete.
 * The scheduled job that detects breaches and calls this is Phase 3 work.
 */
export async function notifySlaBreached(
  tx: Prisma.TransactionClient,
  args: SlaBreachedArgs
): Promise<void> {
  if (!(await getFeatureFlag(FLAG_KEY))) return;
  await tx.notification.create({
    data: {
      userId: args.userId,
      kind: "sla_breached",
      payload: {
        jobId: args.jobId,
        publicNumber: args.publicNumber,
        breachMinutes: args.breachMinutes,
      } satisfies Prisma.InputJsonValue,
      link: `/my-jobs/${args.jobId}`,
    },
  });
}
