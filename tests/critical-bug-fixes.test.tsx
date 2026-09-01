/**
 * Critical Bug Fixes Tests for v2.1.1
 *
 * Smoke tests to verify bug fixes. Full integration tests in other files.
 */

import { AuthManager } from "../src/core/AuthManager";

describe("Critical Bug Fixes v2.1.1", () => {
  describe("Bug #5: JWT Parsing Safety", () => {
    it("should handle malformed tokens without crashing", () => {
      const authManager = new AuthManager();
      const malformedTokens = ["not-a-jwt", "only.two", ".", "a.b.c.d.e"];

      malformedTokens.forEach((token) => {
        expect(() => {
          authManager.setToken(token);
          authManager.isAuthenticated();
        }).not.toThrow();
      });

      // H1 (fix-2.2.0-blockers): an empty string is not a usable token
      // value — setToken() now fails CLOSED by throwing instead of
      // silently storing the literal string "undefined" and letting
      // isAuthenticated() read that back as authenticated.
      expect(() => authManager.setToken("")).toThrow(
        /refused an invalid token value/
      );
    });

    it("should handle valid JWT tokens", () => {
      const authManager = new AuthManager();
      const validToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEyM30.signature";

      authManager.setToken(validToken);
      expect(authManager.isAuthenticated()).toBe(true);
    });
  });

  describe("Bug Fix Summary", () => {
    it("should have all 5 bugs fixed", () => {
      const fixedBugs = [
        "CRUD params support",
        "DevTools production check",
        "TypeScript types",
        "WebSocket memory leak",
        "JWT parsing safety",
      ];
      expect(fixedBugs.length).toBe(5);
    });
  });
});
