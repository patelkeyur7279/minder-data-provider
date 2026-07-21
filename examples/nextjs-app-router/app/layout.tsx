// Root layout — a Server Component. It mounts the client-side Providers
// component, proving the RSC boundary works with minder-data-provider.
import type { ReactNode } from "react";
import Providers from "./providers";

export const metadata = {
  title: "Minder Data Provider — Next.js App Router example",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "2rem" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
