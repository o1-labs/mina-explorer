import { useState, useEffect } from 'react';
import {
  fetchTopBlockProducers,
  fetchBlockProducersByDateRange,
  type TopBlockProducer,
  type BlockProducersResult,
} from '@/services/api/blocks';
import { useNetwork } from './useNetwork';
import { useRequestGeneration } from './useRequestGeneration';

interface UseTopBlockProducersResult {
  producers: TopBlockProducer[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTopBlockProducers(
  sampleSize: number = 500,
  topN: number = 10,
): UseTopBlockProducersResult {
  const [producers, setProducers] = useState<TopBlockProducer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();
  const gen = useRequestGeneration();

  const fetchData = async (): Promise<void> => {
    const token = gen.next();
    setLoading(true);
    setError(null);

    try {
      const data = await fetchTopBlockProducers(sampleSize, topN);
      if (gen.isCurrent(token)) setProducers(data);
    } catch (err) {
      if (gen.isCurrent(token)) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch top producers',
        );
      }
    } finally {
      if (gen.isCurrent(token)) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [network.id, sampleSize, topN]);

  return { producers, loading, error, refetch: fetchData };
}

// Time period presets for staking page
export type TimePeriod = '24h' | '7d' | '30d' | 'epoch' | 'custom';

export interface TimePeriodOption {
  value: TimePeriod;
  label: string;
  getDateRange: () => { start: Date; end: Date };
}

// Mina epoch is ~14 days (7140 slots * 3 minutes)
const EPOCH_DURATION_MS = 7140 * 3 * 60 * 1000;

export const TIME_PERIOD_OPTIONS: TimePeriodOption[] = [
  {
    value: '24h',
    label: 'Last 24 hours',
    getDateRange: () => ({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    }),
  },
  {
    value: '7d',
    label: 'Last 7 days',
    getDateRange: () => ({
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date(),
    }),
  },
  {
    value: '30d',
    label: 'Last 30 days',
    getDateRange: () => ({
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date(),
    }),
  },
  {
    value: 'epoch',
    label: 'Last epoch (~14 days)',
    getDateRange: () => ({
      start: new Date(Date.now() - EPOCH_DURATION_MS),
      end: new Date(),
    }),
  },
];

interface UseBlockProducersByPeriodResult {
  result: BlockProducersResult | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBlockProducersByPeriod(
  period: TimePeriod,
  topN: number = 25,
): UseBlockProducersByPeriodResult {
  const [result, setResult] = useState<BlockProducersResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();
  const gen = useRequestGeneration();

  const fetchData = async (): Promise<void> => {
    const token = gen.next();
    setLoading(true);
    setError(null);

    try {
      const option = TIME_PERIOD_OPTIONS.find(o => o.value === period);
      if (!option) {
        throw new Error(`Unknown time period: ${period}`);
      }

      const { start, end } = option.getDateRange();
      const data = await fetchBlockProducersByDateRange(start, end, topN);
      if (gen.isCurrent(token)) setResult(data);
    } catch (err) {
      if (gen.isCurrent(token)) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to fetch block producers for period',
        );
      }
    } finally {
      if (gen.isCurrent(token)) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [network.id, period, topN]);

  return { result, loading, error, refetch: fetchData };
}
