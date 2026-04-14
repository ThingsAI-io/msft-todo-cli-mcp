import type { TokenData } from '../types.js';
import { load, save } from './token-store.js';
import { runSetup } from './setup.js';

let refreshPromise: Promise<string> | null = null;

function buildTokenUrl(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  tenant: string,
): Promise<TokenData> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'Tasks.ReadWrite offline_access',
  });

  let response: Response;
  try {
    response = await fetch(buildTokenUrl(tenant), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err) {
    throw new Error(
      `Network error during token refresh: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      "Authentication expired. Please re-run 'todo setup' to re-authenticate.",
    );
  }

  const json = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const tokens: TokenData = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    clientId,
    tenant,
  };

  save(tokens);
  return tokens;
}

function isExpiringSoon(expiresAt: number): boolean {
  return expiresAt < Date.now() + 5 * 60 * 1000;
}

/**
 * Returns a valid access token, refreshing if necessary.
 * Concurrent calls share a single in-flight refresh.
 */
export async function getAccessToken(): Promise<string> {
  // 1. Env var override
  const envToken = process.env['TODO_MCP_ACCESS_TOKEN'];
  if (envToken) {
    const envRefresh = process.env['TODO_MCP_REFRESH_TOKEN'];
    const envClient = process.env['TODO_MCP_CLIENT_ID'] ?? '';
    const envTenant = process.env['TODO_MCP_TENANT'] ?? 'consumers';

    if (!envRefresh) {
      return envToken;
    }

    // Build synthetic TokenData from env vars to check expiry
    // With env-only tokens we always refresh since we have no expiresAt
    return doRefresh(envRefresh, envClient, envTenant);
  }

  // 2. Load from encrypted store
  let stored = load();
  if (!stored) {
    // Auto-trigger OAuth setup if client ID is available (e.g. from MCP env)
    const clientId = process.env['TODO_MCP_CLIENT_ID'];
    if (clientId) {
      const tenant = process.env['TODO_MCP_TENANT'] ?? 'consumers';
      await runSetup({ clientId, tenant, silent: true });
      stored = load();
    }
    if (!stored) {
      throw new Error(
        "No authentication found. Run 'todo setup' to authenticate.",
      );
    }
  }

  if (!isExpiringSoon(stored.expiresAt)) {
    return stored.accessToken;
  }

  return doRefresh(stored.refreshToken, stored.clientId, stored.tenant);
}

/**
 * Force a token refresh regardless of expiry (used on 401 retry).
 */
export async function forceRefresh(): Promise<string> {
  const stored = load();
  if (!stored) {
    throw new Error(
      "No authentication found. Run 'todo setup' to authenticate.",
    );
  }

  return doRefresh(stored.refreshToken, stored.clientId, stored.tenant);
}

function doRefresh(
  refreshToken: string,
  clientId: string,
  tenant: string,
): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken(refreshToken, clientId, tenant)
      .then((tokens) => tokens.accessToken)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}
