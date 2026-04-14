import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { exec } from "node:child_process";
import { URL } from "node:url";
import type { TokenData } from "../types.js";
import { save } from "./token-store.js";

const REDIRECT_URI = "http://localhost:3847/callback";
const SCOPES = "Tasks.ReadWrite offline_access";

/** Generate a cryptographically random PKCE code verifier (43-128 chars, URL-safe). */
export function generateCodeVerifier(): string {
  const unreserved = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const length = 128;
  const bytes = randomBytes(length);
  let verifier = "";
  for (let i = 0; i < length; i++) {
    verifier += unreserved[bytes[i] % unreserved.length];
  }
  return verifier;
}

/** Compute the PKCE code challenge: base64url(SHA-256(verifier)), no padding. */
export function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest("base64");
  return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build the Microsoft authorization URL with all required params. */
export function buildAuthorizationUrl(
  clientId: string,
  tenant: string,
  codeChallenge: string,
): string {
  const base = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    response_mode: "query",
  });
  return `${base}?${params.toString()}`;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "win32" ? `start "" "${url}"` :
    platform === "darwin" ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.error("Could not open browser automatically. Please visit:");
      console.log(url);
    }
  });
}

async function exchangeCodeForTokens(
  clientId: string,
  tenant: string,
  code: string,
  codeVerifier: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Authentication Successful</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
<div style="text-align:center">
<h1>&#x2713; Authentication successful!</h1>
<p>You can close this tab.</p>
</div>
</body></html>`;

/** Run the full interactive OAuth PKCE setup flow. */
export async function runSetup(): Promise<void> {
  const clientId = process.env["TODO_MCP_CLIENT_ID"];
  if (!clientId) {
    throw new Error(
      "TODO_MCP_CLIENT_ID environment variable is required. " +
      "Set it to your Azure AD app registration client ID.",
    );
  }
  const tenant = process.env["TODO_MCP_TENANT"] ?? "consumers";

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const authUrl = buildAuthorizationUrl(clientId, tenant, codeChallenge);

  await new Promise<void>((resolve, reject) => {
    const server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? "/", `http://localhost:3847`);
          if (url.pathname !== "/callback") {
            res.writeHead(404);
            res.end("Not found");
            return;
          }

          const code = url.searchParams.get("code");
          if (!code) {
            const error = url.searchParams.get("error") ?? "unknown";
            const desc =
              url.searchParams.get("error_description") ?? "No authorization code received";
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<h1>Error: ${error}</h1><p>${desc}</p>`);
            reject(new Error(`Authorization failed: ${error} — ${desc}`));
            server.close();
            return;
          }

          const tokens = await exchangeCodeForTokens(
            clientId,
            tenant,
            code,
            codeVerifier,
          );

          const tokenData: TokenData = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + tokens.expires_in * 1000,
            clientId,
            tenant,
          };
          save(tokenData);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(SUCCESS_HTML);

          server.close();

          console.log(`\n✓ Authentication successful!\n`);
          console.log(`To use with VS Code, add to settings.json:`);
          console.log(
            JSON.stringify(
              {
                mcp: {
                  servers: {
                    todo: {
                      command: "todo",
                      args: ["serve"],
                    },
                  },
                },
              },
              null,
              2,
            ),
          );

          resolve();
        } catch (err) {
          if (!res.headersSent) {
            res.writeHead(500);
            res.end("Internal error");
          }
          reject(err);
        }
      },
    );

    server.listen(3847, () => {
      console.log("Waiting for authentication...");
      openBrowser(authUrl);
    });

    server.on("error", reject);
  });
}
