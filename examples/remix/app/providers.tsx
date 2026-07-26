// Client-side providers: TanStack QueryClientProvider + MinderDataProvider,
// mirroring ../nextjs-app-router/app/providers.tsx. HttpMethod and
// MinderDataProvider are only exported from the package's root entry point,
// so everything here comes from "minder-data-provider" (not a subpath).
import { useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpMethod, MinderDataProvider } from "minder-data-provider";
import type { MinderConfig } from "minder-data-provider";

const minderConfig: MinderConfig = {
  // Relative base URL: useMinder() below calls the app's own same-origin
  // /api/users resource route, so no external network access or CORS
  // configuration is required.
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
