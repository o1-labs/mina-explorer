import { useState, useEffect } from 'react';
import { fetchAccount } from '@/services/api/accounts';
import { useNetwork } from './useNetwork';
import { useRequestGeneration } from './useRequestGeneration';
import type { Account } from '@/types';

interface UseAccountResult {
  account: Account | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAccount(publicKey: string | undefined): UseAccountResult {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();
  const gen = useRequestGeneration();

  const fetchData = async (): Promise<void> => {
    if (!publicKey) {
      setLoading(false);
      return;
    }

    const token = gen.next();
    setLoading(true);
    setError(null);

    try {
      const data = await fetchAccount(publicKey);
      if (gen.isCurrent(token)) setAccount(data);
    } catch (err) {
      if (gen.isCurrent(token)) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch account',
        );
      }
    } finally {
      if (gen.isCurrent(token)) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [publicKey, network.id]);

  return { account, loading, error, refetch: fetchData };
}
