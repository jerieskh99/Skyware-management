import { Skeleton } from "@/components/ui/skeleton";

export default function ReceiptsListLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <Skeleton className="h-12 w-full" />

      <div className="space-y-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-3/4" />
      </div>

      <div className="rounded-lg border">
        <Skeleton className="h-10 w-full rounded-t-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="mt-px h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
