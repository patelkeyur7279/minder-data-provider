"use client";

// Client providers component: TanStack QueryClientProvider + MinderDataProvider.
// HttpMethod is only exported from the package's main entry point today (see
// the pages-router example for the same note), so everything here comes from
// the root "minder-data-provider" entry.
import { useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpMethod, MinderDataProvider } from "minder-data-provider";
import type { MinderConfig } from "minder-data-provider";

const minderConfig: MinderConfig = {
  // Relative base URL: the app is self-contained and calls its own
  // Next.js route handler, so no external network access is required.
  apiBaseUrl: "",
  routes: {
    users: {
      method: HttpMethod.GET,
      url: "/api/users",
    },
  },
};

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <MinderDataProvider config={minderConfig}>{children}</MinderDataProvider>
    </QueryClientProvider>
  );
}
