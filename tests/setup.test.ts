import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
} from "../src/auth/setup.js";

describe("generateCodeVerifier", () => {
  it("returns a string of 43-128 characters", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("contains only URL-safe characters", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("produces different values on multiple calls", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe("generateCodeChallenge", () => {
  it("returns valid base64url (no +, /, or = padding)", () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    expect(challenge).not.toMatch(/[+/=]/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("equals base64url(SHA-256(verifier)) independently computed", () => {
    const verifier = "test-verifier-value-for-challenge";
    const challenge = generateCodeChallenge(verifier);

    // Independently compute the expected value
    const expected = createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(challenge).toBe(expected);
  });
});

describe("buildAuthorizationUrl", () => {
  it("contains all required parameters", () => {
    const url = buildAuthorizationUrl("my-client-id", "consumers", "my-challenge");

    expect(url).toContain("client_id=my-client-id");
    expect(url).toContain("response_type=code");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("scope=");
    expect(url).toContain("Tasks.ReadWrite");
    expect(url).toContain("offline_access");
    expect(url).toContain("code_challenge=my-challenge");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("response_mode=query");
  });

  it("uses the correct tenant in the base URL", () => {
    const url = buildAuthorizationUrl("cid", "my-tenant", "ch");
    expect(url).toContain("login.microsoftonline.com/my-tenant/oauth2/v2.0/authorize");
  });
});
