import { Skeleton } from "@/components/ui/skeleton";

function ReplySkeleton() {
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

export default function PostDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-4 w-32" />
      <article className="space-y-4 rounded-lg border bg-card p-6">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-7 w-3/4" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/5" />
      </article>
      <section className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <div className="space-y-3">
          <ReplySkeleton />
          <ReplySkeleton />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
      </section>
    </div>
  );
}
