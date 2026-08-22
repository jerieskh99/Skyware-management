"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // refetchOnWindowFocus defaults to true in React Query v5. Combined
          // with a short staleTime, every window refocus refetched all mounted
          // queries at once (the "focus-refetch storm"). Disabling it and
          // lengthening staleTime keeps navigation and refocus quiet; the
          // handful of live views that need freshness use their own
          // refetchInterval.
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
