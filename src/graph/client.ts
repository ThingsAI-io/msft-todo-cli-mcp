const BASE_URL = 'https://graph.microsoft.com/v1.0';

interface GraphErrorBody {
  error: {
    code: string;
    message: string;
  };
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
    return this.executeRequest<T>(method, path, body, queryParams, token, false);
  }

  private async executeRequest<T>(
    method: string,
    path: string,
    body: unknown | undefined,
    queryParams: Record<string, string> | undefined,
    token: string,
    isRetry: boolean
  ): Promise<T | undefined> {
    const url = this.buildUrl(path, queryParams);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };

    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const status = response.status;

    console.error(`Graph API request: ${method} ${path} -> ${status}`);

    if (status === 401 && !isRetry) {
      const newToken = await this.forceRefresh();
      return this.executeRequest<T>(method, path, body, queryParams, newToken, true);
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

    throw new Error(`Graph API error ${status}: ${errorCode} - ${errorMessage}`);
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
