import React from "react";
import { MinderDataProvider } from "minder-data-provider";
import type { MinderConfig } from "minder-data-provider";

// 🌍 STEP 1: Create Multi-Environment Config
const envConfig: MinderConfig = {
  apiBaseUrl: "https://jsonplaceholder.typicode.com",
  routes: {},
  dynamic: null,
  defaultEnvironment: "development",
  autoDetectEnvironment: true,
  environments: {
    development: {
      apiBaseUrl: "https://jsonplaceholder.typicode.com", // External API
      cors: {
        enabled: true, // ✅ Enable CORS proxy
        proxy: "/api/minder-proxy", // ✅ Proxy route
        credentials: true,
      },
      debug: true,
    },
  },
};

// 🎯 STEP 2: Use Environment Config (NOT regular config)
export default function CorsExample() {
  return (
    <MinderDataProvider config={envConfig}>
      {" "}
      {/* ← Use envConfig, not regular config */}
      <div>
        <h1>CORS Solution Guide</h1>
        <p>
          This example shows how to handle CORS with environment-specific
          configuration.
        </p>
      </div>
    </MinderDataProvider>
  );
}
