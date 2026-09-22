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

/**
 * A single reading of the daemon's wall-clock consensus time, plus the constants
 * needed to keep counting locally between readings.
 *
 * This is the "Consensus time now" that `mina client status` prints. The daemon
 * derives it from the genesis timestamp and the current time — NOT from the
 * chain tip — so it keeps advancing while block production is stalled. That is
 * what makes it different from `fetchEpochInfo()` above, which reads the best
 * tip and therefore freezes whenever the chain does.
 */
export interface ConsensusTimeAnchor {
  /**
   * Absolute slot since the last hard fork. Satisfies exactly
   * `globalSlot === epoch * slotsPerEpoch + slot`, so it is the absolute count
   * that agrees with the epoch/slot pair shown next to it.
   */
  globalSlot: number;
  /**
   * How much to add to `globalSlot` to get the slot count since the ORIGINAL
   * genesis, spanning hard forks. Derived at runtime rather than hardcoded,
   * because it changes at every fork. Null when the daemon reports no best tip
   * (bootstrapping), in which case the since-genesis count is unknown.
   */
  forkOffset: number | null;
  /** Unix ms at which `globalSlot` began, per the daemon. */
  slotStartTime: number;
  /** Unix ms at which `globalSlot` ends, per the daemon. */
  slotEndTime: number;
  /** 7140 on every current network, but read rather than assumed. */
  slotsPerEpoch: number;
  /**
   * Slot length in ms: 90_000 on devnet and mainnet since the mesa hard fork,
   * which halved mainnet's slot from the original 180_000. Read rather than
   * assumed — a hard fork is exactly when a hardcoded value goes wrong quietly.
   */
  slotDuration: number;
  /**
   * Unix ms of the genesis this chain counts slots from — the daemon's
   * `genesisStateTimestamp`. `globalSlot` is exactly
   * `floor((now - chainStartTime) / slotDuration)`, verified on both networks,
   * which is what makes it meaningful to show beside the slot.
   *
   * On a network that has hard-forked this is the CURRENT chain's genesis, not
   * the original one — consistent with `globalSlot` being a since-hard-fork
   * count. NaN if the daemon's timestamp cannot be parsed.
   */
  chainStartTime: number;
  /** `Date.now()` when this reading was received, for local advancement. */
  receivedAt: number;
}

/**
 * Parse the daemon's genesis timestamp, e.g. `"2024-06-05 00:00:00.000000Z"`.
 *
 * That is not valid ISO-8601 — a space stands in for `T` and there are six
 * fractional digits where the spec allows three — so it is normalised rather
 * than handed straight to Date, which V8 tolerates but stricter engines reject.
 * Returns NaN if it still will not parse.
 */
function parseGenesisTimestamp(value: string): number {
  return Date.parse(value.replace(' ', 'T').replace(/\.(\d{3})\d+/, '.$1'));
}

/**
 * Read the daemon's current consensus time.
 *
 * Note every `ConsensusTime` field arrives as a JSON *string* (the UInt32,
 * GlobalSlotSinceHardFork and BlockTime scalars all serialize that way) while
 * `consensusConfiguration` and `globalSlotSinceGenesisBestTip` are real numbers.
 *
 * Returns null on any failure — the consensus clock is decoration next to the
 * chain data, so a daemon that is down must not surface an error banner.
 */
export async function fetchConsensusTime(): Promise<ConsensusTimeAnchor | null> {
  try {
    const data = await queryDaemon<{
      daemonStatus: {
        consensusTimeNow: {
          globalSlot: string;
          startTime: string;
          endTime: string;
        };
        consensusTimeBestTip: { globalSlot: string } | null;
        globalSlotSinceGenesisBestTip: number | null;
        consensusConfiguration: {
          slotsPerEpoch: number;
          slotDuration: number;
          genesisStateTimestamp: string;
        };
      };
    }>(`{
      daemonStatus {
        consensusTimeNow {
          globalSlot
          startTime
          endTime
        }
        consensusTimeBestTip {
          globalSlot
        }
        globalSlotSinceGenesisBestTip
        consensusConfiguration {
          slotsPerEpoch
          slotDuration
          genesisStateTimestamp
        }
      }
    }`);

    const status = data.daemonStatus;
    const now = status.consensusTimeNow;
    const config = status.consensusConfiguration;

    const globalSlot = parseInt(now.globalSlot, 10);
    const slotStartTime = Number(now.startTime);
    const slotEndTime = Number(now.endTime);
    const { slotsPerEpoch, slotDuration } = config;
    // Not part of the guard below: an unparseable genesis timestamp costs one
    // reference figure, and dropping the whole reading over it would take the
    // live slot down with it.
    const chainStartTime = parseGenesisTimestamp(config.genesisStateTimestamp);

    if (
      !Number.isFinite(globalSlot) ||
      !Number.isFinite(slotStartTime) ||
      !Number.isFinite(slotEndTime) ||
      !Number.isFinite(slotsPerEpoch) ||
      !Number.isFinite(slotDuration) ||
      slotsPerEpoch <= 0 ||
      slotDuration <= 0
    ) {
      return null;
    }

    // The daemon exposes the since-genesis count only for the best tip, so the
    // fork offset is read from that pair and applied to `consensusTimeNow`.
    // Both halves must be present for the difference to mean anything.
    const bestTipGlobalSlot = status.consensusTimeBestTip
      ? parseInt(status.consensusTimeBestTip.globalSlot, 10)
      : NaN;
    const bestTipSinceGenesis = status.globalSlotSinceGenesisBestTip;
    const forkOffset =
      Number.isFinite(bestTipGlobalSlot) && bestTipSinceGenesis !== null
        ? bestTipSinceGenesis - bestTipGlobalSlot
        : null;

    return {
      globalSlot,
      forkOffset,
      slotStartTime,
      slotEndTime,
      slotsPerEpoch,
      slotDuration,
      chainStartTime,
      receivedAt: Date.now(),
    };
  } catch {
    return null;
  }
}
