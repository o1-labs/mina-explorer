import { NETWORKS, DEFAULT_NETWORK } from './networks';
import { getStoredItem } from '@/lib/safeStorage';
import { isSafeUrl } from '@/utils/formatters';

const NETWORK_KEY = 'mina-explorer-network';
const NETWORK_PARAM = 'network';
export const CUSTOM_ENDPOINT_KEY = 'mina-explorer-custom-endpoint';

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
 * Note: this helper deliberately does NOT consult the custom-endpoint entry —
 * callers that need to honour a custom endpoint call getActiveCustomEndpoint()
 * first (as getInitialEndpoint and getDaemonEndpoint do).
 */
export function resolveActiveNetworkId(): string {
  const fromUrl = getActiveNetworkIdFromHash();
  if (fromUrl) return fromUrl;

  const saved = getStoredItem(NETWORK_KEY);
  if (saved && NETWORKS[saved]) return saved;

  return DEFAULT_NETWORK;
}

/**
 * The user-configured custom endpoint (used for BOTH the archive and the
 * daemon), or null when none is set or it isn't a valid http(s) URL. Unlike
 * resolveActiveNetworkId(), this DOES honour the custom override, so archive
 * and daemon callers stay on the same endpoint instead of silently diverging.
 */
export function getActiveCustomEndpoint(): string | null {
  const saved = getStoredItem(CUSTOM_ENDPOINT_KEY);
  return saved && isSafeUrl(saved) ? saved : null;
}
