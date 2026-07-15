import { useState, useEffect } from 'react';
import { useNetwork } from './useNetwork';
import { useRequestGeneration } from './useRequestGeneration';
import {
  fetchBlocksForAnalytics,
  calculateNetworkAnalytics,
  type NetworkAnalytics,
} from '@/services/api/analytics';

export type AnalyticsPeriod = '24h' | '7d' | '30d';

interface UseAnalyticsResult {
  analytics: NetworkAnalytics | null;
  loading: boolean;
  error: string | null;
  period: AnalyticsPeriod;
  setPeriod: (period: AnalyticsPeriod) => void;
  refetch: () => void;
}

const PERIOD_DAYS: Record<AnalyticsPeriod, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
};

export function useAnalytics(): UseAnalyticsResult {
  const { network } = useNetwork();
  const gen = useRequestGeneration();
  const [analytics, setAnalytics] = useState<NetworkAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d');

  const fetchData = async (): Promise<void> => {
    if (!network) return;

    const token = gen.next();
    setLoading(true);
    setError(null);

    try {
      const days = PERIOD_DAYS[period];
      const blocks = await fetchBlocksForAnalytics(days);
      const stats = calculateNetworkAnalytics(blocks, days);
      if (gen.isCurrent(token)) setAnalytics(stats);
    } catch (err) {
      console.error('[Analytics] Failed to fetch:', err);
      if (gen.isCurrent(token)) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch analytics',
        );
      }
    } finally {
      if (gen.isCurrent(token)) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [network, period]);

  return {
    analytics,
    loading,
    error,
    period,
    setPeriod,
    refetch: fetchData,
  };
}
