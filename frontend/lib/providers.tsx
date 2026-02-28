"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime:        5 * 60 * 1000,  // 5 min — don't re-fetch until data is 5 min old
            gcTime:           10 * 60 * 1000, // 10 min — keep unused queries in cache for 10 min
            retry:            1,
            refetchOnWindowFocus: false,       // avoid surprise re-fetches when user tabs back
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
