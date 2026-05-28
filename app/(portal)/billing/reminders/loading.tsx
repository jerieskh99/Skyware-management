import { Skeleton } from "@/components/ui/skeleton";

export default function BillingRemindersLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
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
