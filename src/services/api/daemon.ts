import { NETWORKS, DEFAULT_NETWORK } from '@/config';

const NETWORK_KEY = 'mina-explorer-network';

export function getDaemonEndpoint(): string {
  const savedNetwork = localStorage.getItem(NETWORK_KEY);
  const networkId =
    savedNetwork && NETWORKS[savedNetwork] ? savedNetwork : DEFAULT_NETWORK;
  return NETWORKS[networkId].daemonEndpoint;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function queryDaemon<T>(query: string): Promise<T> {
  const endpoint = getDaemonEndpoint();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors && result.errors.length > 0) {
    const errorMessages = result.errors.map(e => e.message).join(', ');
    throw new Error(`GraphQL error: ${errorMessages}`);
  }

  if (!result.data) {
    throw new Error('No data in response');
  }

  return result.data;
}

export function isCorsError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('CORS'))
  );
}

export function isDaemonUnavailableError(error: unknown): boolean {
  if (isCorsError(error)) return true;
  if (error instanceof Error) {
    return (
      error.message.includes('transition frontier') ||
      error.message.includes('Could not find block')
    );
  }
  return false;
}

/** Max blocks to request from daemon in a single bestChain call */
export const MAX_DAEMON_BLOCKS = 30;
