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
    const result = buildAuthorizationUrl("my-client-id", "consumers", "my-challenge");

    expect(result.url).toContain("client_id=my-client-id");
    expect(result.url).toContain("response_type=code");
    expect(result.url).toContain("redirect_uri=");
    expect(result.url).toContain("scope=");
    expect(result.url).toContain("Tasks.ReadWrite");
    expect(result.url).toContain("offline_access");
    expect(result.url).toContain("code_challenge=my-challenge");
    expect(result.url).toContain("code_challenge_method=S256");
    expect(result.url).toContain("response_mode=query");
    expect(result.state).toBeTruthy();
  });

  it("uses the correct tenant in the base URL", () => {
    const result = buildAuthorizationUrl("cid", "my-tenant", "ch");
    expect(result.url).toContain("login.microsoftonline.com/my-tenant/oauth2/v2.0/authorize");
  });

  it("includes state parameter in the URL", () => {
    const result = buildAuthorizationUrl("cid", "consumers", "ch");
    expect(result.url).toContain("state=" + result.state);
  });

  it("produces different state values on different calls", () => {
    const r1 = buildAuthorizationUrl("cid", "consumers", "ch");
    const r2 = buildAuthorizationUrl("cid", "consumers", "ch");
    expect(r1.state).not.toBe(r2.state);
  });
});
