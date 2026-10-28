import type { GraphQLResponse, GraphQLError } from '@/types';
import { fetchWithTimeout, isTimeoutError } from './http';

export class ApiError extends Error {
  constructor(
    message: string,
    public errors?: GraphQLError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// graphql-js validation messages, for servers that send no error code.
const VALIDATION_MESSAGE =
  /Cannot query field|is not defined by type|Unknown argument/;

/**
 * True when the server validated the query and rejected its shape, e.g. an
 * archive that lacks a field or the inBestChain filter. Only then can a
 * smaller query tier succeed where this one failed.
 *
 * Anything else (a rate limit, even one with a JSON `errors` body; a masked
 * resolver or database failure; network; timeout) is not about the query's
 * shape, so query-tier fallbacks must rethrow it: falling through only adds
 * requests against a struggling endpoint, and a lower tier that slips in once
 * it recovers renders reduced data, or "not found", as if it were the answer.
 */
export function isQueryRejection(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.errors ?? []).some(
      e =>
        e.extensions?.code === 'GRAPHQL_VALIDATION_FAILED' ||
        VALIDATION_MESSAGE.test(e.message),
    )
  );
}

export class GraphQLClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  async query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const queryName = this.extractQueryName(query);
    console.log(`[API] ${queryName} → ${this.endpoint}`, variables || '');

    const startTime = performance.now();

    try {
      const response = await fetchWithTimeout(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      const duration = Math.round(performance.now() - startTime);

      if (!response.ok) {
        // Some GraphQL servers transport validation errors with a non-2xx
        // status; surface those messages (callers inspect them, e.g. to
        // detect unsupported query filters) instead of a bare HTTP error.
        let errors: GraphQLError[] | undefined;
        try {
          const body = (await response.json()) as GraphQLResponse<T>;
          if (body.errors && body.errors.length > 0) {
            errors = body.errors;
          }
        } catch {
          // Body is not JSON; fall through to the generic HTTP error.
        }
        const errorMsg = errors
          ? `GraphQL error: ${errors.map(e => e.message).join(', ')}`
          : `HTTP error: ${response.status} ${response.statusText}`;
        console.error(`[API] ${queryName} FAILED (${duration}ms):`, errorMsg);
        throw new ApiError(errorMsg, errors);
      }

      const result = (await response.json()) as GraphQLResponse<T>;

      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map(e => e.message).join(', ');
        console.error(
          `[API] ${queryName} FAILED (${duration}ms):`,
          errorMessages,
        );
        throw new ApiError(`GraphQL error: ${errorMessages}`, result.errors);
      }

      console.log(`[API] ${queryName} OK (${duration}ms)`);
      return result.data;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      if (error instanceof ApiError) {
        throw error;
      }
      if (isTimeoutError(error)) {
        const timeoutMsg =
          'Request timed out. The endpoint may be unavailable.';
        console.error(`[API] ${queryName} TIMEOUT (${duration}ms)`);
        throw new ApiError(timeoutMsg);
      }
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[API] ${queryName} FAILED (${duration}ms):`, errorMsg);
      throw new ApiError(`Network error: ${errorMsg}`);
    }
  }

  private extractQueryName(query: string): string {
    const match = query.match(/(?:query|mutation)\s+(\w+)/);
    return match ? match[1] : 'GraphQL';
  }
}

let clientInstance: GraphQLClient | null = null;

export function getClient(endpoint?: string): GraphQLClient {
  if (!clientInstance && endpoint) {
    clientInstance = new GraphQLClient(endpoint);
  }
  if (!clientInstance) {
    throw new Error('GraphQL client not initialized. Provide an endpoint.');
  }
  return clientInstance;
}

export function initClient(endpoint: string): GraphQLClient {
  clientInstance = new GraphQLClient(endpoint);
  return clientInstance;
}
