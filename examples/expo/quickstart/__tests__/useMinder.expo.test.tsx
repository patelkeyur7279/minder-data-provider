/**
 * Runtime-path proof for the Expo quickstart.
 *
 * These tests render a real React Native component tree (via
 * @testing-library/react-native + react-test-renderer, under the jest-expo
 * preset) that calls `useMinder()` imported from the library's `/expo`
 * platform entry point — the same import App.tsx uses. Network calls are
 * intercepted by mocking `global.fetch`; minder's ApiClient is built on
 * axios, and axios's `fetch` adapter is selected automatically in this
 * environment (no XMLHttpRequest, no Node "http" adapter available), so
 * mocking `global.fetch` genuinely intercepts the request instead of
 * silently missing it.
 *
 * What this proves: the hook, the query cache, and the expo-platform
 * entry point's exports all execute correctly inside a React Native JS
 * runtime (Hermes-compatible code paths via Jest/Babel), end to end from
 * render to resolved state. What it does NOT prove: anything about a real
 * device/simulator (native modules, real network stack, UI rendering on
 * screen) — see README.md "What This Evidence Proves" for the full list.
 */
import React from "react";
import { Text } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// eslint-disable-next-line import/no-unresolved -- resolved via package.json "exports", see metro.config.js / jest.config.js
import { useMinder, MinderDataProvider } from "minder-data-provider/expo";

interface User {
  id: number;
  name: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
    async () => jsonResponse(body, status)
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** axios's `fetch` adapter calls `fetch(new Request(url, init))`, not a bare
 * URL string — normalize either shape down to a plain string for assertions. */
function requestedUrl(fetchArg: unknown): string {
  if (fetchArg instanceof Request) return fetchArg.url;
  return String(fetchArg);
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

function AbsoluteUrlUserCard({ userId }: { userId: number }) {
  // Absolute http(s) URL: exempt from needing a MinderDataProvider/global
  // config (see useMinder's zero-config exemption) — mirrors App.tsx.
  const { data, loading, error } = useMinder<User>(
    `https://jsonplaceholder.typicode.com/users/${userId}`
  );

  if (loading) return <Text testID="status">loading</Text>;
  if (error) return <Text testID="status">error:{String(error.message ?? error)}</Text>;
  return <Text testID="status">{data?.name}</Text>;
}

describe("useMinder via minder-data-provider/expo", () => {
  afterEach(() => {
    // @ts-expect-error -- test-only global override
    delete global.fetch;
    jest.clearAllMocks();
  });

  it("renders loading, then the resolved user from a mocked network response", async () => {
    const fetchMock = mockFetchOnce({ id: 1, name: "Ada Lovelace" });

    renderWithQueryClient(<AbsoluteUrlUserCard userId={1} />);

    expect(screen.getByTestId("status").props.children).toBe("loading");

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("Ada Lovelace");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl(fetchMock.mock.calls[0][0])).toContain(
      "jsonplaceholder.typicode.com/users/1"
    );
  });

  it("surfaces an error state when the mocked response is a failure", async () => {
    mockFetchOnce({ message: "not found" }, 404);

    renderWithQueryClient(<AbsoluteUrlUserCard userId={999} />);

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children[0]).toBe("error:");
    });
  });

  it("resolves data through MinderDataProvider + a relative route (expo provider path)", async () => {
    const fetchMock = mockFetchOnce({ id: 2, name: "Grace Hopper" });

    function ProvidedUserCard() {
      const { data, loading } = useMinder<User>("/users/2");
      if (loading) return <Text testID="status">loading</Text>;
      return <Text testID="status">{data?.name}</Text>;
    }

    renderWithQueryClient(
      <MinderDataProvider
        config={{
          apiBaseUrl: "https://jsonplaceholder.typicode.com",
          routes: {},
        }}
      >
        <ProvidedUserCard />
      </MinderDataProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").props.children).toBe("Grace Hopper");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl(fetchMock.mock.calls[0][0])).toContain(
      "jsonplaceholder.typicode.com/users/2"
    );
  });
});
