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
  isTestnet: boolean;
  /** Links to other explorers for this network */
  otherExplorers?: ExplorerLink[];
}

export const NETWORKS: Record<string, NetworkConfig> = {
  'pre-mesa': {
    id: 'pre-mesa',
    name: 'pre-mesa',
    displayName: 'Pre-Mesa',
    archiveEndpoint: 'https://pre-mesa-archive-node-api.gcp.o1test.net',
    daemonEndpoint:
      'https://plain-1-graphql.hetzner-pre-mesa-1.gcp.o1test.net/graphql',
    isTestnet: true,
  },
  mesa: {
    id: 'mesa',
    name: 'mesa',
    displayName: 'Mesa',
    archiveEndpoint: 'https://mesa-archive-node-api.gcp.o1test.net',
    // Mesa uses devnet daemon for now (no dedicated mesa daemon endpoint)
    daemonEndpoint: 'https://devnet-plain-1.gcp.o1test.net/graphql',
    isTestnet: true,
    otherExplorers: [
      {
        name: 'Mesa Explorer (Basic)',
        url: 'https://mesa-explorer.vercel.app/',
        description: 'Last 290 blocks only',
      },
      {
        name: 'MinaExplorer Mesa',
        url: 'https://mesa.minaexplorer.com/',
        description: "Gareth's explorer",
      },
    ],
  },
  devnet: {
    id: 'devnet',
    name: 'devnet',
    displayName: 'Devnet',
    archiveEndpoint: 'https://devnet-archive-node-api.gcp.o1test.net',
    daemonEndpoint: 'https://devnet-plain-1.gcp.o1test.net/graphql',
    isTestnet: true,
  },
  mainnet: {
    id: 'mainnet',
    name: 'mainnet',
    displayName: 'Mainnet',
    archiveEndpoint: 'https://archive-node-api.gcp.o1test.net',
    daemonEndpoint: 'https://mainnet-plain-1.gcp.o1test.net/graphql',
    isTestnet: false,
  },
};

export const DEFAULT_NETWORK = 'mesa';
