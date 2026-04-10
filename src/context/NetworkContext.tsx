import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  NETWORKS,
  DEFAULT_NETWORK,
  resolveActiveNetworkId,
  type NetworkConfig,
} from '@/config';
import { initClient, getClient } from '@/services/api';

const CUSTOM_ENDPOINT_KEY = 'mina-explorer-custom-endpoint';
const NETWORK_KEY = 'mina-explorer-network';
const NETWORK_PARAM = 'network';

interface NetworkContextValue {
  network: NetworkConfig;
  setNetwork: (networkId: string) => void;
  availableNetworks: NetworkConfig[];
  customEndpoint: string | null;
  setCustomEndpoint: (endpoint: string | null) => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

function getInitialEndpoint(): {
  network: NetworkConfig;
  customEndpoint: string | null;
} {
  // Custom endpoint always wins — it's an explicit local override.
  const savedCustom = localStorage.getItem(CUSTOM_ENDPOINT_KEY);
  if (savedCustom) {
    return {
      network: {
        id: 'custom',
        name: 'custom',
        displayName: 'Custom',
        archiveEndpoint: savedCustom,
        daemonEndpoint: savedCustom,
        isTestnet: true,
      },
      customEndpoint: savedCustom,
    };
  }

  // Otherwise resolve via shared precedence: URL hash → localStorage → default.
  const networkId = resolveActiveNetworkId();
  return {
    network: NETWORKS[networkId],
    customEndpoint: null,
  };
}

// Initialize client immediately with default or saved custom endpoint
const initial = getInitialEndpoint();
initClient(initial.network.archiveEndpoint);

interface NetworkProviderProps {
  children: ReactNode;
}

export function NetworkProvider({ children }: NetworkProviderProps): ReactNode {
  const [network, setNetworkState] = useState<NetworkConfig>(initial.network);
  const [customEndpoint, setCustomEndpointState] = useState<string | null>(
    initial.customEndpoint,
  );
  const [searchParams, setSearchParams] = useSearchParams();

  // Keep `?network=<id>` in the URL in sync with the active network so that
  // shared/copied URLs always carry network context.
  //
  // - If the URL has no `network` param, we add the current one (replace, no
  //   history entry) so any internal navigation re-acquires it immediately.
  // - If the URL has a valid `network` param that differs from the current
  //   state (e.g. user pasted a shared link, or hit back/forward), we adopt
  //   it without writing localStorage — the URL is treated as session-scoped.
  // - Custom endpoints have no shareable id; strip any stale param so the URL
  //   reflects the actual state.
  useEffect(() => {
    if (customEndpoint) {
      if (searchParams.has(NETWORK_PARAM)) {
        const next = new URLSearchParams(searchParams);
        next.delete(NETWORK_PARAM);
        setSearchParams(next, { replace: true });
      }
      return;
    }

    const urlId = searchParams.get(NETWORK_PARAM);

    if (urlId && NETWORKS[urlId]) {
      if (urlId !== network.id) {
        const newNetwork = NETWORKS[urlId];
        setNetworkState(newNetwork);
        getClient().setEndpoint(newNetwork.archiveEndpoint);
      }
      return;
    }

    // No (or invalid) network param in URL — write the current one back.
    const next = new URLSearchParams(searchParams);
    next.set(NETWORK_PARAM, network.id);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, network.id, customEndpoint]);

  const setNetwork = (networkId: string): void => {
    const newNetwork = NETWORKS[networkId];
    if (newNetwork) {
      setNetworkState(newNetwork);
      setCustomEndpointState(null);
      localStorage.removeItem(CUSTOM_ENDPOINT_KEY);
      localStorage.setItem(NETWORK_KEY, networkId);
      getClient().setEndpoint(newNetwork.archiveEndpoint);
      const next = new URLSearchParams(searchParams);
      next.set(NETWORK_PARAM, networkId);
      setSearchParams(next, { replace: true });
    }
  };

  const setCustomEndpoint = (endpoint: string | null): void => {
    if (endpoint) {
      const customNetwork: NetworkConfig = {
        id: 'custom',
        name: 'custom',
        displayName: 'Custom',
        archiveEndpoint: endpoint,
        daemonEndpoint: endpoint,
        isTestnet: true,
      };
      setNetworkState(customNetwork);
      setCustomEndpointState(endpoint);
      localStorage.setItem(CUSTOM_ENDPOINT_KEY, endpoint);
      getClient().setEndpoint(endpoint);
      // Drop any stale `network` param — it doesn't apply to custom endpoints.
      const next = new URLSearchParams(searchParams);
      next.delete(NETWORK_PARAM);
      setSearchParams(next, { replace: true });
    } else {
      setCustomEndpointState(null);
      localStorage.removeItem(CUSTOM_ENDPOINT_KEY);
      setNetwork(DEFAULT_NETWORK);
    }
  };

  const availableNetworks = Object.values(NETWORKS);

  return (
    <NetworkContext.Provider
      value={{
        network,
        setNetwork,
        availableNetworks,
        customEndpoint,
        setCustomEndpoint,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
