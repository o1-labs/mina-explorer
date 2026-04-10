import { NETWORKS, DEFAULT_NETWORK } from './networks';

const NETWORK_KEY = 'mina-explorer-network';
const NETWORK_PARAM = 'network';

/**
 * Parse `?network=<id>` from `window.location.hash` (HashRouter URLs look
 * like `#/block/10?network=mainnet`). Returns the id only if it matches a
 * known network in NETWORKS, otherwise null.
 *
 * Used at module-load time, before React Router is mounted.
 */
export function getActiveNetworkIdFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  if (qIdx < 0) return null;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const id = params.get(NETWORK_PARAM);
  if (id && NETWORKS[id]) return id;
  return null;
}

/**
 * Resolve the active network id with the precedence:
 *   1. `?network=<id>` query param in the URL hash
 *   2. `localStorage['mina-explorer-network']`
 *   3. DEFAULT_NETWORK
 *
 * Note: this helper deliberately does NOT consult the
 * `mina-explorer-custom-endpoint` localStorage entry — callers that need to
 * honour a custom endpoint must check it themselves before calling this.
 */
export function resolveActiveNetworkId(): string {
  const fromUrl = getActiveNetworkIdFromHash();
  if (fromUrl) return fromUrl;

  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(NETWORK_KEY);
    if (saved && NETWORKS[saved]) return saved;
  }

  return DEFAULT_NETWORK;
}
