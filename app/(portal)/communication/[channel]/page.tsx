import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import {
  getChannelOrNull,
  listChannelPosts,
} from "@/lib/communication/queries";
import { ComposePost } from "@/components/communication/ComposePost";
import { EmptyState } from "@/components/shared/EmptyState";
import { JobTagChips } from "@/components/jobs/JobTagChips";
import { timeAgo } from "@/lib/time";
import { MessageSquare, ArrowLeft, Pin, CheckCircle } from "lucide-react";

interface Props {
  params: Promise<{ channel: string }>;
  searchParams: Promise<Record<string, string>>;
}

export default async function ChannelPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const { channel: channelKey } = await params;
  const sp = await searchParams;
  const search = sp["search"]?.trim() || undefined;
  const showResolved = sp["resolved"] === "1";

  const channel = await getChannelOrNull(user, channelKey);
  if (!channel) notFound();

  const posts = await listChannelPosts(channel.id, {
    search,
    resolved: showResolved ? true : undefined,
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <Link
          href="/communication"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All channels
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{channel.nameEn}</h1>
        {channel.description && (
          <p className="text-sm text-muted-foreground">{channel.description}</p>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="flex-1">
          <input
            type="text"
            name="search"
            defaultValue={search ?? ""}
            placeholder="Search posts..."
            className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
        <Link
          href={showResolved ? `/communication/${channelKey}` : `/communication/${channelKey}?resolved=1`}
          className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
        >
          {showResolved ? "Show open" : "Show resolved"}
        </Link>
      </div>

      {/* Compose */}
      <ComposePost channelKey={channelKey} />

      {/* Post list */}
      {posts.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={search ? `No posts matching "${search}".` : showResolved ? "No resolved posts." : "No posts yet."}
          description={!search && !showResolved ? "Be the first to post in this channel." : undefined}
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/communication/${channelKey}/${post.id}`}
              className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {post.pinned && (
                      <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Pinned" />
                    )}
                    {post.resolved && (
                      <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" aria-label="Resolved" />
                    )}
                    <span className="font-medium leading-snug">{post.title}</span>
                  </div>
                  <p
                    className="text-sm text-muted-foreground line-clamp-2"
                    dir="auto"
                  >
                    {post.body}
                  </p>
                  <JobTagChips tags={post.tags.map((t) => t.tag)} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{post.author.displayName}</span>
                    <span title={new Date(post.createdAt).toISOString()}>
                      {timeAgo(new Date(post.createdAt))}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {post._count.replies}
                    </span>
                    {post.relatedJob && (
                      <span className="font-mono">{post.relatedJob.publicNumber}</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
