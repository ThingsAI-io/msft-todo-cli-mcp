import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphClient } from '../src/graph/client.js';

describe('GraphClient', () => {
  let mockGetToken: ReturnType<typeof vi.fn>;
  let mockForceRefresh: ReturnType<typeof vi.fn>;
  let client: GraphClient;
  let mockFetch: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockGetToken = vi.fn().mockResolvedValue('test-token');
    mockForceRefresh = vi.fn().mockResolvedValue('refreshed-token');
    client = new GraphClient(mockGetToken, mockForceRefresh);
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function jsonResponse(data: unknown, status = 200): Response {
    return {
      status,
      json: () => Promise.resolve(data),
    } as Response;
  }

  function errorResponse(status: number, code: string, message: string): Response {
    return {
      status,
      json: () => Promise.resolve({ error: { code, message } }),
    } as Response;
  }

  // 1. Correct URL construction
  it('constructs URL with base URL + path', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1' }));
    await client.request('GET', '/me/todo/lists');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/todo/lists',
      expect.any(Object)
    );
  });

  // 2. Authorization header
  it('sets Authorization header with Bearer token', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    await client.request('GET', '/me/todo/lists');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer test-token');
  });

  // 3. Content-Type for POST/PATCH
  it('sets Content-Type to application/json for POST', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    await client.request('POST', '/me/todo/lists', { displayName: 'Test' });
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('sets Content-Type to application/json for PATCH', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    await client.request('PATCH', '/me/todo/lists/1', { displayName: 'Updated' });
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  // 4. GET requests have no body
  it('does not include body for GET requests', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    await client.request('GET', '/me/todo/lists');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toBeUndefined();
  });

  // 5. POST requests serialize body
  it('serializes body to JSON for POST requests', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    const body = { displayName: 'My List' };
    await client.request('POST', '/me/todo/lists', body);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toBe(JSON.stringify(body));
  });

  // 6. PATCH requests serialize body
  it('serializes body to JSON for PATCH requests', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    const body = { displayName: 'Updated' };
    await client.request('PATCH', '/me/todo/lists/1', body);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toBe(JSON.stringify(body));
  });

  // 7. 200 response returns parsed JSON
  it('returns parsed JSON for 200 response', async () => {
    const data = { id: '123', displayName: 'Tasks' };
    mockFetch.mockResolvedValue(jsonResponse(data));
    const result = await client.request('GET', '/me/todo/lists/123');
    expect(result).toEqual(data);
  });

  // 8. 204 response returns undefined
  it('returns undefined for 204 response (DELETE)', async () => {
    mockFetch.mockResolvedValue({ status: 204, json: () => Promise.resolve(null) } as Response);
    const result = await client.request('DELETE', '/me/todo/lists/123');
    expect(result).toBeUndefined();
  });

  // 9. 401 triggers retry with force-refreshed token
  it('retries once with force-refreshed token on 401', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(401, 'InvalidAuthenticationToken', 'Token expired'))
      .mockResolvedValueOnce(jsonResponse({ id: '1' }));

    await client.request('GET', '/me/todo/lists');

    expect(mockForceRefresh).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [, retryOptions] = mockFetch.mock.calls[1];
    expect(retryOptions.headers.Authorization).toBe('Bearer refreshed-token');
  });

  // 10. 401 retry that succeeds returns data
  it('returns data normally after successful 401 retry', async () => {
    const data = { id: '1', displayName: 'Tasks' };
    mockFetch
      .mockResolvedValueOnce(errorResponse(401, 'InvalidAuthenticationToken', 'Token expired'))
      .mockResolvedValueOnce(jsonResponse(data));

    const result = await client.request('GET', '/me/todo/lists');
    expect(result).toEqual(data);
  });

  // 11. 401 retry that also fails throws error
  it('throws error when 401 retry also fails', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(401, 'InvalidAuthenticationToken', 'Token expired'))
      .mockResolvedValueOnce(errorResponse(401, 'InvalidAuthenticationToken', 'Still expired'));

    await expect(client.request('GET', '/me/todo/lists')).rejects.toThrow(
      'Graph API error 401: InvalidAuthenticationToken - Still expired'
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockForceRefresh).toHaveBeenCalledTimes(1);
  });

  // 12. 400 response throws with status + error type
  it('throws error with status and error type for 400', async () => {
    mockFetch.mockResolvedValue(errorResponse(400, 'BadRequest', 'Invalid filter'));
    await expect(client.request('GET', '/me/todo/lists')).rejects.toThrow(
      'Graph API error 400: BadRequest - Invalid filter'
    );
  });

  // 13. 403/404/500 throw descriptive errors
  it('throws error for 403 response', async () => {
    mockFetch.mockResolvedValue(errorResponse(403, 'AccessDenied', 'Forbidden'));
    await expect(client.request('GET', '/me/todo/lists')).rejects.toThrow(
      'Graph API error 403: AccessDenied - Forbidden'
    );
  });

  it('throws error for 404 response', async () => {
    mockFetch.mockResolvedValue(errorResponse(404, 'ResourceNotFound', 'Not found'));
    await expect(client.request('GET', '/me/todo/lists/bad')).rejects.toThrow(
      'Graph API error 404: ResourceNotFound - Not found'
    );
  });

  it('throws error for 500 response', async () => {
    mockFetch.mockResolvedValue(errorResponse(500, 'InternalServerError', 'Server error'));
    await expect(client.request('GET', '/me/todo/lists')).rejects.toThrow(
      'Graph API error 500: InternalServerError - Server error'
    );
  });

  // 14. No response body in console output
  it('never logs response body data', async () => {
    const sensitiveData = { id: '1', displayName: 'Secret List', value: [{ title: 'secret task' }] };
    mockFetch.mockResolvedValue(jsonResponse(sensitiveData));
    await client.request('GET', '/me/todo/lists');

    for (const call of consoleErrorSpy.mock.calls) {
      const output = call.join(' ');
      expect(output).not.toContain('Secret List');
      expect(output).not.toContain('secret task');
    }
    for (const call of consoleLogSpy.mock.calls) {
      const output = call.join(' ');
      expect(output).not.toContain('Secret List');
      expect(output).not.toContain('secret task');
    }
  });

  // 15. Query parameters appended correctly
  it('appends query parameters to URL', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ value: [] }));
    await client.request('GET', '/me/todo/lists/1/tasks', undefined, {
      $filter: "status eq 'completed'",
      $top: '10',
    });

    const [url] = mockFetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.searchParams.get('$filter')).toBe("status eq 'completed'");
    expect(parsed.searchParams.get('$top')).toBe('10');
    expect(url.startsWith('https://graph.microsoft.com/v1.0/me/todo/lists/1/tasks')).toBe(true);
  });

  // DELETE has no body
  it('does not include body for DELETE requests', async () => {
    mockFetch.mockResolvedValue({ status: 204, json: () => Promise.resolve(null) } as Response);
    await client.request('DELETE', '/me/todo/lists/123');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toBeUndefined();
  });
});
