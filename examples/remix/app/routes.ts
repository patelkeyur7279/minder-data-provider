import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  // Resource route (no default export — see routes/api.users.tsx): same-origin
  // JSON endpoint the client-side useMinder() call below hits, so the browser
  // never needs CORS against the mock upstream on :8788.
  route("api/users", "routes/api.users.tsx"),
] satisfies RouteConfig;
