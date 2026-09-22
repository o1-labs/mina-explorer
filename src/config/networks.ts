export interface ExplorerLink {
  name: string;
  url: string;
  description?: string;
}

export interface NetworkConfig {
  id: string;
  name: string;
  displayName: string;
  /** Archive node GraphQL endpoint for historical data (blocks, transactions) */
  archiveEndpoint: string;
  /** Mina daemon GraphQL endpoint for real-time account data */
  daemonEndpoint: string;
  /**
   * mina-explorer-api REST base, INCLUDING the network path segment
   * (e.g. `https://<proxy>/mina-devnet`). Optional: a network without it keeps using the
   * archive GraphQL path untouched, which is what makes this rollout per-network and
   * reversible by config alone.
   *
   * This points at a PROXY that holds the API key, never at the API directly — this app is
   * a static bundle, so a key shipped here would be readable by anyone. See
   * `src/services/api/rest.ts`.
   *
   * The network segment is part of the value rather than derived, because this app's ids
   * (`devnet`, `mainnet`) are not the API's (`mina-devnet`, `mina-mainnet`) and a mapping
   * table is a thing that goes stale silently.
   *
   * Only the BLOCKS LIST reads through here today; every other surface is still archive or
   * daemon. The rollout went testnet-first — it landed on a testnet as the then-default
   * network, so a regression cost nobody a real answer, and mainnet followed once the
   * paging had been verified against each chain's real end-of-range.
   */
  restEndpoint?: string;
  isTestnet: boolean;
  /** Links to other explorers for this network */
  otherExplorers?: ExplorerLink[];
}

// Runtime config injected by /config.js (see public/config.js and
// docker/entrypoint.sh). Self-hosted Docker users override the compiled
// defaults below by setting MINA_EXPLORER_DEFAULT_NETWORK and
// MINA_EXPLORER_NETWORKS env vars on the container.
declare global {
  interface Window {
    __MINA_EXPLORER_CONFIG__?: {
      defaultNetwork?: string;
      networks?: Record<string, Partial<NetworkConfig>>;
    };
  }
}

const COMPILED_NETWORKS: Record<string, NetworkConfig> = {
  devnet: {
    id: 'devnet',
    name: 'devnet',
    displayName: 'Devnet',
    archiveEndpoint: 'https://devnet-archive-node-api.gcp.o1test.net',
    daemonEndpoint: 'https://devnet-plain-1.gcp.o1test.net/graphql',
    restEndpoint: 'https://mina-explorer-proxy.minaprotocol.com/mina-devnet',
    isTestnet: true,
    otherExplorers: [
      {
        name: 'Minascan',
        url: 'https://minascan.io/devnet/home',
      },
    ],
  },
  mainnet: {
    id: 'mainnet',
    name: 'mainnet',
    displayName: 'Mainnet',
    archiveEndpoint: 'https://archive-node-api.gcp.o1test.net',
    daemonEndpoint: 'https://mainnet-plain-1.gcp.o1test.net/graphql',
    restEndpoint: 'https://mina-explorer-proxy.minaprotocol.com/mina-mainnet',
    isTestnet: false,
    otherExplorers: [
      {
        name: 'Minascan',
        url: 'https://minascan.io/mainnet/home',
      },
    ],
  },
};

const COMPILED_DEFAULT_NETWORK = 'mainnet';

const RUNTIME =
  (typeof window !== 'undefined' && window.__MINA_EXPLORER_CONFIG__) || {};

const merged: Record<string, NetworkConfig> = { ...COMPILED_NETWORKS };
for (const [id, override] of Object.entries(RUNTIME.networks ?? {})) {
  const base = merged[id];
  if (base) {
    // Partial override of an existing network — fields not set fall through
    // to the compiled value. The id is forced to the map key so the user
    // can't make the object disagree with itself.
    merged[id] = { ...base, ...override, id };
  } else if (override.archiveEndpoint && override.daemonEndpoint) {
    // Adding a brand-new network — both endpoints are mandatory
    merged[id] = {
      id,
      name: override.name ?? id,
      displayName: override.displayName ?? id,
      archiveEndpoint: override.archiveEndpoint,
      daemonEndpoint: override.daemonEndpoint,
      isTestnet: override.isTestnet ?? true,
      ...(override.otherExplorers
        ? { otherExplorers: override.otherExplorers }
        : {}),
    };
  } else {
    console.warn(
      `[mina-explorer] runtime config: ignoring network "${id}" — needs archiveEndpoint and daemonEndpoint`,
    );
  }
}

export const NETWORKS: Record<string, NetworkConfig> = merged;

export const DEFAULT_NETWORK: string =
  RUNTIME.defaultNetwork && merged[RUNTIME.defaultNetwork]
    ? RUNTIME.defaultNetwork
    : COMPILED_DEFAULT_NETWORK;
