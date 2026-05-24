import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { getChannelOrNull, getPostWithReplies } from "@/lib/communication/queries";
import { ComposeReply } from "@/components/communication/ComposeReply";
import { PostActions } from "@/components/communication/PostActions";
import { JobTagChips } from "@/components/jobs/JobTagChips";
import { Separator } from "@/components/ui/separator";
import { timeAgo, formatTz } from "@/lib/time";
import { ArrowLeft, Pin, CheckCircle } from "lucide-react";

interface Props {
  params: Promise<{ channel: string; postId: string }>;
}

export default async function PostDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const { channel: channelKey, postId } = await params;
  const channel = await getChannelOrNull(user, channelKey);
  if (!channel) notFound();

  const post = await getPostWithReplies(postId, channel.id);
  if (!post) notFound();

  const admin = isAdmin(user);
  const isAuthor = post.author.id === user.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back link */}
      <Link
        href={`/communication/${channelKey}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {channel.nameEn}
      </Link>

      {/* Post */}
      <article className="space-y-4 rounded-lg border bg-card p-6">
        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-2">
          {post.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
              <Pin className="h-3 w-3" /> Pinned
            </span>
          )}
          {post.resolved && (
            <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
              <CheckCircle className="h-3 w-3" /> Resolved
            </span>
          )}
        </div>

        <h1 className="text-xl font-semibold leading-snug">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{post.author.displayName}</span>
          <span title={formatTz(new Date(post.createdAt))}>
            {timeAgo(new Date(post.createdAt))}
          </span>
          {post.relatedJob && (
            <Link
              href={`/my-jobs/${post.relatedJob.id}`}
              className="font-mono hover:underline"
            >
              {post.relatedJob.publicNumber} — {post.relatedJob.title}
            </Link>
          )}
        </div>

        <JobTagChips tags={post.tags.map((t) => t.tag)} />

        <div
          className="text-sm leading-relaxed whitespace-pre-wrap"
          dir="auto"
        >
          {post.body}
        </div>

        <PostActions
          channelKey={channelKey}
          postId={post.id}
          resolved={post.resolved}
          pinned={post.pinned}
          isAuthor={isAuthor}
          isAdmin={admin}
        />
      </article>

      {/* Replies */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Replies ({post.replies.length})
        </h2>

        {post.replies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No replies yet.</p>
        ) : (
          <div className="space-y-3">
            {post.replies.map((reply) => (
              <div
                key={reply.id}
                className="rounded-lg border bg-muted/20 p-4 space-y-1.5"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {reply.author.displayName}
                  </span>
                  <span title={formatTz(new Date(reply.createdAt))}>
                    {timeAgo(new Date(reply.createdAt))}
                  </span>
                </div>
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  dir="auto"
                >
                  {reply.body}
                </p>
              </div>
            ))}
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Add a reply</h3>
          <ComposeReply channelKey={channelKey} postId={post.id} />
        </div>
      </section>
    </div>
  );
}
