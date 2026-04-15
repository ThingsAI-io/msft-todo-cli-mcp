const BASE_URL = 'https://graph.microsoft.com/v1.0';
const MAX_RETRIES = 3;

interface GraphErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export class GraphApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(`Graph API error ${statusCode}: ${errorCode} - ${message}`);
    this.name = 'GraphApiError';
  }
  get isRetryable(): boolean { return this.statusCode === 429 || this.statusCode >= 500; }
  get isNotFound(): boolean { return this.statusCode === 404; }
  get isAuthError(): boolean { return this.statusCode === 401 || this.statusCode === 403; }
}

export class GraphClient {
  constructor(
    private getToken: () => Promise<string>,
    private forceRefresh: () => Promise<string>
  ) {}

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string>
  ): Promise<T | undefined> {
    const token = await this.getToken();
    return this.executeRequest<T>(method, path, body, queryParams, token, false, 0);
  }

  private async executeRequest<T>(
    method: string,
    path: string,
    body: unknown | undefined,
    queryParams: Record<string, string> | undefined,
    token: string,
    isRetry: boolean,
    retryCount: number
  ): Promise<T | undefined> {
    const url = this.buildUrl(path, queryParams);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers, redirect: 'error' };

    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const status = response.status;

    console.error(`Graph API request: ${method} ${path} -> ${status}`);

    if (status === 401 && !isRetry) {
      const newToken = await this.forceRefresh();
      return this.executeRequest<T>(method, path, body, queryParams, newToken, true, retryCount);
    }

    if (status === 429 && retryCount < MAX_RETRIES) {
      const retryAfter = response.headers.get('Retry-After');
      const delayMs = retryAfter
        ? Number(retryAfter) * 1000
        : Math.min(1000 * 2 ** retryCount, 30000);
      await new Promise(r => setTimeout(r, delayMs));
      return this.executeRequest<T>(method, path, body, queryParams, token, isRetry, retryCount + 1);
    }

    if (status === 204) {
      return undefined;
    }

    if (status >= 200 && status < 300) {
      return (await response.json()) as T;
    }

    let errorCode = 'Unknown';
    let errorMessage = 'Unknown error';
    try {
      const errorBody = (await response.json()) as GraphErrorBody;
      errorCode = errorBody.error.code;
      errorMessage = errorBody.error.message;
    } catch {
      // Could not parse error body
    }

    throw new GraphApiError(status, errorCode, errorMessage);
  }

  private buildUrl(path: string, queryParams?: Record<string, string>): string {
    const url = new URL(BASE_URL + path);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.append(key, value);
      }
    }
    return url.toString();
  }
}
