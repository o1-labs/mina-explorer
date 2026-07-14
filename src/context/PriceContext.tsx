import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { fetchCurrentPrice, type MINAPrice } from '@/services/api/price';

interface PriceContextValue {
  price: MINAPrice | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const PriceContext = createContext<PriceContextValue | null>(null);

// Auto-refresh interval (5 minutes). Kept equal to the price cache TTL in
// price.ts so each scheduled refresh performs exactly one real network fetch.
const REFRESH_INTERVAL = 5 * 60 * 1000;

interface PriceProviderProps {
  children: ReactNode;
}

/**
 * Single source of truth for the current MINA price. One provider owns one
 * fetch and one refresh timer for the whole app, so a page full of <Amount>
 * components (each of which reads usePrice) no longer arms N timers or fires N
 * concurrent CoinGecko requests. Previously usePrice was a per-instance hook,
 * so ~100 list rows stampeded the rate-limited CoinGecko API on every mount and
 * again every 5 minutes. See issue #72.
 */
export function PriceProvider({ children }: PriceProviderProps): ReactNode {
  const [price, setPrice] = useState<MINAPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    try {
      const data = await fetchCurrentPrice();
      setPrice(data);
      setError(null);
    } catch (err) {
      // Keep the last good price on error (stale data is better than none); the
      // error only surfaces in the UI while there is no price to show.
      console.warn('[Price] Failed to fetch MINA price:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch MINA price',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch plus a single auto-refresh timer for the whole app.
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <PriceContext.Provider
      value={{ price, loading, error, refetch: fetchData }}
    >
      {children}
    </PriceContext.Provider>
  );
}

/**
 * Read the shared current MINA price. Must be used within a PriceProvider.
 */
export function usePrice(): PriceContextValue {
  const context = useContext(PriceContext);
  if (!context) {
    throw new Error('usePrice must be used within a PriceProvider');
  }
  return context;
}
