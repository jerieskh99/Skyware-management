import { Skeleton } from "@/components/ui/skeleton";

function FormSectionSkeleton({ fieldCount = 2 }: { fieldCount?: number }) {
  return (
    <div className="space-y-4 rounded-lg border p-6">
      <Skeleton className="h-5 w-40" />
      <div className="space-y-3">
        {Array.from({ length: fieldCount }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full max-w-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <FormSectionSkeleton fieldCount={3} />
      <FormSectionSkeleton fieldCount={1} />
      <FormSectionSkeleton fieldCount={2} />
    </div>
  );
}
