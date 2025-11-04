import type { AppProps } from "next/app";
import React from "react";
import { configureMinder } from "minder-data-provider";

// Configure minder globally - no provider needed!
configureMinder({
  baseURL: "http://localhost:8080/api",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

export default function App({ Component, pageProps }: AppProps) {
  console.log("✅ minder() configured globally - ready to use!");

  return <Component {...pageProps} />;
}
