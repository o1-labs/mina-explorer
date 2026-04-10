import { useState, useEffect, useCallback } from 'react';
import {
  fetchBlocks,
  fetchBlocksPaginated,
  fetchBlockByHeight,
  fetchBlockByHash,
  fetchNetworkState,
} from '@/services/api';
import { fetchEpochInfo, type EpochInfo } from '@/services/api/daemon';
import { useNetwork } from './useNetwork';
import type { BlockSummary, BlockDetail, NetworkState } from '@/types';

interface UseBlocksResult {
  blocks: BlockSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBlocks(limit: number = 25): UseBlocksResult {
  const { network } = useNetwork();
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBlocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBlocks(limit);
      setBlocks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch blocks');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Refetch when network changes
  useEffect(() => {
    loadBlocks();
  }, [loadBlocks, network.id]);

  return { blocks, loading, error, refresh: loadBlocks };
}

interface UseBlockResult {
  block: BlockDetail | null;
  loading: boolean;
  error: string | null;
}

export function useBlock(identifier: string | number): UseBlockResult {
  const { network } = useNetwork();
  const [block, setBlock] = useState<BlockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBlock = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        let data: BlockDetail | null;
        if (
          typeof identifier === 'number' ||
          /^\d+$/.test(String(identifier))
        ) {
          data = await fetchBlockByHeight(Number(identifier));
        } else {
          data = await fetchBlockByHash(String(identifier));
        }
        setBlock(data);
        if (!data) {
          setError('Block not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch block');
      } finally {
        setLoading(false);
      }
    };

    loadBlock();
  }, [identifier, network.id]);

  return { block, loading, error };
}

interface UseNetworkStateResult {
  networkState: NetworkState | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useNetworkState(): UseNetworkStateResult {
  const { network } = useNetwork();
  const [networkState, setNetworkState] = useState<NetworkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNetworkState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNetworkState();
      setNetworkState(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch network state',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch when network changes
  useEffect(() => {
    loadNetworkState();
  }, [loadNetworkState, network.id]);

  return { networkState, loading, error, refresh: loadNetworkState };
}

interface UsePaginatedBlocksResult {
  blocks: BlockSummary[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  totalBlockHeight: number;
  page: number;
  totalPages: number;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  refresh: () => void;
}

export function usePaginatedBlocks(
  pageSize: number = 25,
): UsePaginatedBlocksResult {
  const { network } = useNetwork();
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalBlockHeight, setTotalBlockHeight] = useState(0);

  const totalPages = Math.ceil(totalBlockHeight / pageSize);

  const loadPage = useCallback(
    async (pageNum: number, forceRefresh: boolean = false) => {
      setLoading(true);
      setError(null);

      try {
        // Calculate cursor for the page
        // For page 1, no cursor needed (get latest)
        // For page N, get blocks before height (totalHeight - (N-1) * pageSize + 1)
        let cursor: number | undefined;
        if (pageNum > 1 && totalBlockHeight > 0) {
          cursor = totalBlockHeight - (pageNum - 1) * pageSize + 1;
          if (cursor <= 0) cursor = undefined;
        }

        const data = await fetchBlocksPaginated(pageSize, cursor);
        setBlocks(data.blocks);
        setHasMore(data.hasMore);

        // Only update total on first load or refresh
        if (pageNum === 1 || forceRefresh || totalBlockHeight === 0) {
          setTotalBlockHeight(data.totalBlockHeight);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch blocks');
      } finally {
        setLoading(false);
      }
    },
    [pageSize, totalBlockHeight],
  );

  // Reset and load when network changes
  useEffect(() => {
    setPage(1);
    setTotalBlockHeight(0);
    loadPage(1, true);
  }, [network.id, pageSize]);

  // Load page when page number changes (but not on initial mount)
  useEffect(() => {
    if (totalBlockHeight > 0) {
      loadPage(page);
    }
  }, [page, totalBlockHeight]);

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
    loadPage(1, true);
  }, [loadPage]);

  return {
    blocks,
    loading,
    error,
    hasMore,
    totalBlockHeight,
    page,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    refresh,
  };
}

interface UseEpochInfoResult {
  epochInfo: EpochInfo | null;
  loading: boolean;
}

export function useEpochInfo(): UseEpochInfoResult {
  const { network } = useNetwork();
  const [epochInfo, setEpochInfo] = useState<EpochInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchEpochInfo()
      .then(data => setEpochInfo(data))
      .finally(() => setLoading(false));
  }, [network.id]);

  return { epochInfo, loading };
}
