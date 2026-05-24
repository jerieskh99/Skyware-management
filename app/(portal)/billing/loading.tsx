import { Skeleton } from "@/components/ui/skeleton";

function KpiCardSkeleton() {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

function PaymentRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-20" />
      <div className="ml-auto flex items-center gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-8 w-8" />
      </div>
    </div>
  );
}

export default function BillingLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-5 w-32" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <div className="rounded-lg border">
        <div className="divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <PaymentRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
