import { NETWORKS, DEFAULT_NETWORK } from './networks';

export const config = {
  apiEndpoint:
    import.meta.env.VITE_API_ENDPOINT ||
    NETWORKS[DEFAULT_NETWORK].archiveEndpoint,
  defaultNetwork: import.meta.env.VITE_DEFAULT_NETWORK || DEFAULT_NETWORK,
};

export { NETWORKS, DEFAULT_NETWORK } from './networks';
export type { NetworkConfig, ExplorerLink } from './networks';
export {
  getActiveNetworkIdFromHash,
  resolveActiveNetworkId,
} from './activeNetwork';
