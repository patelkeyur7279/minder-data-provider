import type { Config } from "@react-router/dev/config";

export default {
  // SSR on — the whole point of this example is proving the loader's
  // server-side minder() call renders into the initial HTML.
  ssr: true,
} satisfies Config;
