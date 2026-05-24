import { Skeleton } from "@/components/ui/skeleton";

// Shell-level fallback. Static sidebar/header live in the layout; only the
// content area remounts on route change, so this only needs page content.
export default function PortalLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="space-y-2 pt-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
