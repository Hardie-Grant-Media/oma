import { afterEach, describe, expect, it, vi } from "vitest";
import { safeOAuthRedirect } from "../../src/lib/mcp-auth";

afterEach(() => vi.unstubAllEnvs());
describe("production OAuth redirects", () => {
  it("accepts native Codex loopback callbacks", () => {
    vi.stubEnv("DEV", false);
    expect(
      safeOAuthRedirect(
        "http://127.0.0.1:43123/callback/OxMh69owFNWg?code=test",
      ),
    ).toBe("http://127.0.0.1:43123/callback/OxMh69owFNWg?code=test");
    expect(
      safeOAuthRedirect(
        "https://chatgpt.com/connector_platform_oauth_redirect",
      ),
    ).toBe("https://chatgpt.com/connector_platform_oauth_redirect");
  });
  it.each([
    "http://example.com/callback",
    "http://127.0.0.1:43123/admin",
    "http://127.0.0.1.example.com/callback",
    "http://localhost/callback",
    "https://user:password@example.com/callback",
    "javascript:alert(1)",
  ])("rejects unsafe callback %s", (url) => {
    vi.stubEnv("DEV", false);
    expect(() => safeOAuthRedirect(url)).toThrow(
      "Invalid connection redirect.",
    );
  });
});
