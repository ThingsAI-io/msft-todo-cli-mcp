import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TokenData } from '../src/types.js';

// Mock token-store
vi.mock('../src/auth/token-store.js', () => ({
  load: vi.fn(),
  save: vi.fn(),
}));

import { load, save } from '../src/auth/token-store.js';
const mockLoad = vi.mocked(load);
const mockSave = vi.mocked(save);

function makeTokenData(overrides: Partial<TokenData> = {}): TokenData {
  return {
    accessToken: 'stored-access-token',
    refreshToken: 'stored-refresh-token',
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
    clientId: 'test-client-id',
    tenant: 'test-tenant-id',
    ...overrides,
  };
}

function makeRefreshResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'new-access-token',
    refresh_token: 'new-refresh-token',
    expires_in: 3600,
    ...overrides,
  };
}

describe('token-manager', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env['TODO_MCP_ACCESS_TOKEN'];
    delete process.env['TODO_MCP_REFRESH_TOKEN'];
    delete process.env['TODO_MCP_CLIENT_ID'];
    delete process.env['TODO_MCP_TENANT'];

    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    mockLoad.mockReset();
    mockSave.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function getModule() {
    const mod = await import('../src/auth/token-manager.js');
    return mod;
  }

  it('1. returns cached non-expired token without fetch', async () => {
    const tokens = makeTokenData();
    mockLoad.mockReturnValue(tokens);

    const { getAccessToken } = await getModule();
    const result = await getAccessToken();

    expect(result).toBe('stored-access-token');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('2. triggers refresh for expired token', async () => {
    const tokens = makeTokenData({ expiresAt: Date.now() - 1000 });
    mockLoad.mockReturnValue(tokens);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeRefreshResponse(),
    });

    const { getAccessToken } = await getModule();
    const result = await getAccessToken();

    expect(result).toBe('new-access-token');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('3. triggers refresh for near-expiry token (within 5-min window)', async () => {
    const tokens = makeTokenData({
      expiresAt: Date.now() + 2 * 60 * 1000, // 2 min from now
    });
    mockLoad.mockReturnValue(tokens);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeRefreshResponse(),
    });

    const { getAccessToken } = await getModule();
    const result = await getAccessToken();

    expect(result).toBe('new-access-token');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('4. refresh updates both access and refresh tokens in store', async () => {
    const tokens = makeTokenData({ expiresAt: Date.now() - 1000 });
    mockLoad.mockReturnValue(tokens);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeRefreshResponse(),
    });

    const { getAccessToken } = await getModule();
    await getAccessToken();

    expect(mockSave).toHaveBeenCalledOnce();
    const saved = mockSave.mock.calls[0]![0] as TokenData;
    expect(saved.accessToken).toBe('new-access-token');
    expect(saved.refreshToken).toBe('new-refresh-token');
    expect(saved.clientId).toBe('test-client-id');
    expect(saved.tenant).toBe('test-tenant-id');
    expect(saved.expiresAt).toBeGreaterThan(Date.now());
  });

  it('5. env var TODO_MCP_ACCESS_TOKEN takes priority over file', async () => {
    process.env['TODO_MCP_ACCESS_TOKEN'] = 'env-access-token';
    mockLoad.mockReturnValue(makeTokenData());

    const { getAccessToken } = await getModule();
    const result = await getAccessToken();

    expect(result).toBe('env-access-token');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('6. env var with TODO_MCP_REFRESH_TOKEN enables refresh from env', async () => {
    process.env['TODO_MCP_ACCESS_TOKEN'] = 'env-access-token';
    process.env['TODO_MCP_REFRESH_TOKEN'] = 'env-refresh-token';
    process.env['TODO_MCP_CLIENT_ID'] = 'env-client-id';
    process.env['TODO_MCP_TENANT'] = 'env-tenant';

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeRefreshResponse(),
    });

    const { getAccessToken } = await getModule();
    const result = await getAccessToken();

    expect(result).toBe('new-access-token');
    expect(mockFetch).toHaveBeenCalledOnce();

    // Verify the correct tenant was used
    const callArgs = mockFetch.mock.calls[0]!;
    const url = callArgs[0] as string;
    expect(url).toContain('env-tenant');
  });

  it('7. concurrent calls share single refresh (mutex)', async () => {
    const tokens = makeTokenData({ expiresAt: Date.now() - 1000 });
    mockLoad.mockReturnValue(tokens);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeRefreshResponse(),
    });

    const { getAccessToken } = await getModule();
    const [r1, r2, r3] = await Promise.all([
      getAccessToken(),
      getAccessToken(),
      getAccessToken(),
    ]);

    expect(r1).toBe('new-access-token');
    expect(r2).toBe('new-access-token');
    expect(r3).toBe('new-access-token');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('8. failed refresh throws with "re-run todo setup" message', async () => {
    const tokens = makeTokenData({ expiresAt: Date.now() - 1000 });
    mockLoad.mockReturnValue(tokens);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    const { getAccessToken } = await getModule();
    await expect(getAccessToken()).rejects.toThrow(
      /re-run.*todo setup/i,
    );
  });

  it('9. network error during refresh throws descriptive error', async () => {
    const tokens = makeTokenData({ expiresAt: Date.now() - 1000 });
    mockLoad.mockReturnValue(tokens);
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const { getAccessToken } = await getModule();
    await expect(getAccessToken()).rejects.toThrow(/network error/i);
  });

  it('10. refresh request body contains correct params, no client_secret', async () => {
    const tokens = makeTokenData({ expiresAt: Date.now() - 1000 });
    mockLoad.mockReturnValue(tokens);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeRefreshResponse(),
    });

    const { getAccessToken } = await getModule();
    await getAccessToken();

    const callArgs = mockFetch.mock.calls[0]!;
    const bodyStr = callArgs[1].body as string;
    const params = new URLSearchParams(bodyStr);

    expect(params.get('client_id')).toBe('test-client-id');
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('stored-refresh-token');
    expect(params.get('scope')).toBe('Tasks.ReadWrite offline_access');
    expect(params.has('client_secret')).toBe(false);
  });

  it('11. refresh uses configurable tenant from stored token data', async () => {
    const tokens = makeTokenData({
      expiresAt: Date.now() - 1000,
      tenant: 'my-custom-tenant',
    });
    mockLoad.mockReturnValue(tokens);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeRefreshResponse(),
    });

    const { getAccessToken } = await getModule();
    await getAccessToken();

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toBe(
      'https://login.microsoftonline.com/my-custom-tenant/oauth2/v2.0/token',
    );
    expect(url).not.toContain('consumers');
  });

  it('12. no tokens anywhere throws "No authentication found"', async () => {
    mockLoad.mockReturnValue(null);

    const { getAccessToken } = await getModule();
    await expect(getAccessToken()).rejects.toThrow(
      /no authentication found/i,
    );
  });
});
