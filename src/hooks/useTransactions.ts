import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchPendingTransactions,
  fetchPendingZkAppCommands,
  fetchTransactionByHash,
  fetchAccountTransactions,
  fetchRecentTransactions,
  type PendingTransaction,
  type PendingZkAppCommand,
  type TransactionDetail,
  type AccountTransaction,
  type ConfirmedTransaction,
} from '@/services/api/transactions';
import { useNetwork } from './useNetwork';

interface UsePendingTransactionsResult {
  transactions: PendingTransaction[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UsePendingZkAppCommandsResult {
  commands: PendingZkAppCommand[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePendingTransactions(): UsePendingTransactionsResult {
  const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();

  const fetchData = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchPendingTransactions();
      setTransactions(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch transactions',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [network.id]);

  return { transactions, loading, error, refetch: fetchData };
}

export function usePendingZkAppCommands(): UsePendingZkAppCommandsResult {
  const [commands, setCommands] = useState<PendingZkAppCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();

  const fetchData = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchPendingZkAppCommands();
      setCommands(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch zkApp commands',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [network.id]);

  return { commands, loading, error, refetch: fetchData };
}

interface UseTransactionResult {
  transaction: TransactionDetail | null;
  loading: boolean;
  error: string | null;
}

export function useTransaction(hash: string): UseTransactionResult {
  const [transaction, setTransaction] = useState<TransactionDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();

  useEffect(() => {
    if (!hash) {
      setTransaction(null);
      setLoading(false);
      return;
    }

    const fetchData = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchTransactionByHash(hash);
        if (!data) {
          setError('Transaction not found');
        }
        setTransaction(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch transaction',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [hash, network.id]);

  return { transaction, loading, error };
}

interface UseAccountTransactionsResult {
  transactions: AccountTransaction[];
  loading: boolean;
  error: string | null;
}

export function useAccountTransactions(
  publicKey: string,
): UseAccountTransactionsResult {
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();

  useEffect(() => {
    if (!publicKey) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    const fetchData = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchAccountTransactions(publicKey);
        setTransactions(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to fetch account transactions',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [publicKey, network.id]);

  return { transactions, loading, error };
}

const TXS_PER_PAGE = 25;

interface UseRecentTransactionsResult {
  /** Current page of transactions */
  transactions: ConfirmedTransaction[];
  /** All fetched transactions */
  allTransactions: ConfirmedTransaction[];
  loading: boolean;
  error: string | null;
  blocksScanned: number;
  page: number;
  totalPages: number;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  refresh: () => void;
}

export function useRecentTransactions(
  maxBlocks: number = 30,
): UseRecentTransactionsResult {
  const { network } = useNetwork();
  const [allTransactions, setAllTransactions] = useState<
    ConfirmedTransaction[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocksScanned, setBlocksScanned] = useState(0);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(
    1,
    Math.ceil(allTransactions.length / TXS_PER_PAGE),
  );

  // Current page slice
  const transactions = useMemo(() => {
    const start = (page - 1) * TXS_PER_PAGE;
    return allTransactions.slice(start, start + TXS_PER_PAGE);
  }, [allTransactions, page]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchRecentTransactions(maxBlocks);
      setAllTransactions(data.transactions);
      setBlocksScanned(data.blocksScanned);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch transactions',
      );
    } finally {
      setLoading(false);
    }
  }, [maxBlocks]);

  // Reload when network changes
  useEffect(() => {
    setPage(1);
    setAllTransactions([]);
    loadData();
  }, [network.id, loadData]);

  const goToPage = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setPage(newPage);
      }
    },
    [totalPages],
  );

  const nextPage = useCallback(() => {
    if (page < totalPages) {
      setPage(p => p + 1);
    }
  }, [page, totalPages]);

  const prevPage = useCallback(() => {
    if (page > 1) {
      setPage(p => p - 1);
    }
  }, [page]);

  const refresh = useCallback(() => {
    setPage(1);
    loadData();
  }, [loadData]);

  return {
    transactions,
    allTransactions,
    loading,
    error,
    blocksScanned,
    page,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    refresh,
  };
}
