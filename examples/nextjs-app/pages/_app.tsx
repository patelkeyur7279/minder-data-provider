import type { AppProps } from "next/app";
// HttpMethod is only exported from the package's main entry point today —
// it is not re-exported from the `/nextjs` (or `/web`) subpath, even though
// `ApiRoute.method` is typed as `HttpMethod`. We pull it from the root
// package and the provider/hook from the `/nextjs` subpath, which is a
// perfectly normal (if slightly surprising) way to consume the package.
import { HttpMethod } from "minder-data-provider";
import { MinderDataProvider } from "minder-data-provider/nextjs";
import type { MinderConfig } from "minder-data-provider/nextjs";

const minderConfig: MinderConfig = {
  // Relative base URL: the app is self-contained and calls its own
  // Next.js API routes, so no external network access is required.
  apiBaseUrl: "",
  routes: {
    users: {
      method: HttpMethod.GET,
      url: "/api/users",
    },
  },
};

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MinderDataProvider config={minderConfig}>
      <Component {...pageProps} />
    </MinderDataProvider>
  );
}
