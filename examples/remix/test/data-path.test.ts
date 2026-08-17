// Mock-level unit test of the data path this example's loader and resource
// route both use: minder() against an upstream. Runs against a throwaway
// Node http server (same shape as mock-upstream.mjs) rather than booting the
// full React Router app, keeping the test fast and framework-independent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { minder } from "minder-data-provider";

interface User {
  id: number;
  name: string;
  email: string;
}

let server: http.Server;
let baseURL: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/users") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ id: 1, name: "Ada", email: "ada@example.com" }]));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseURL = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("minder() data path against the mock upstream", () => {
  it("fetches /users and returns Ada on success", async () => {
    const result = await minder<User[]>("/users", undefined, {
      baseURL,
      transport: "fetch",
    });

    expect(result.success).toBe(true);
    expect(result.data?.[0]?.name).toBe("Ada");
    expect(result.data?.[0]?.email).toBe("ada@example.com");
  });

  it("reports failure with a 404 status for an unknown route", async () => {
    const result = await minder("/does-not-exist", undefined, {
      baseURL,
      transport: "fetch",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });
});
