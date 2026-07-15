import { fetchWithTimeout } from './http';

// The daemon endpoint is a singleton set from NetworkContext state, mirroring
// the archive client (initClient/getClient): initialized at module load of
// NetworkContext and updated at the exact moments the archive endpoint is
// updated (setNetwork, setCustomEndpoint, URL-param adoption). It must never
// be re-resolved from the URL/localStorage at call time — during internal
// navigation the URL momentarily has no `?network=` param, and a network
// adopted from a shared link is deliberately not written to localStorage, so
// call-time resolution could silently target a different network than the one
// the UI displays (#88). A custom endpoint overrides the selected network for
// the daemon too (#71); NetworkContext passes it through this same setter.
let daemonEndpoint: string | null = null;

export function setDaemonEndpoint(endpoint: string): void {
  daemonEndpoint = endpoint;
}

export function getDaemonEndpoint(): string {
  if (!daemonEndpoint) {
    throw new Error(
      'Daemon endpoint not initialized. Call setDaemonEndpoint first.',
    );
  }
  return daemonEndpoint;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function queryDaemon<T>(query: string): Promise<T> {
  const endpoint = getDaemonEndpoint();
  const response = await fetchWithTimeout(endpoint, {
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

export async function mutateDaemon<T>(
  mutation: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const endpoint = getDaemonEndpoint();
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: mutation, variables }),
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

export interface EpochInfo {
  epoch: number;
  slot: number;
  slotSinceGenesis: number;
  blockHeight: number;
}

export async function fetchEpochInfo(): Promise<EpochInfo | null> {
  try {
    const data = await queryDaemon<{
      bestChain: Array<{
        protocolState: {
          consensusState: {
            blockHeight: string;
            epoch: string;
            slot: string;
            slotSinceGenesis: string;
          };
        };
      }>;
    }>(`{
      bestChain(maxLength: 1) {
        protocolState {
          consensusState {
            blockHeight
            epoch
            slot
            slotSinceGenesis
          }
        }
      }
    }`);

    const block = data.bestChain?.[0];
    if (!block) return null;

    const cs = block.protocolState.consensusState;
    return {
      epoch: parseInt(cs.epoch, 10),
      slot: parseInt(cs.slot, 10),
      slotSinceGenesis: parseInt(cs.slotSinceGenesis, 10),
      blockHeight: parseInt(cs.blockHeight, 10),
    };
  } catch {
    return null;
  }
}
