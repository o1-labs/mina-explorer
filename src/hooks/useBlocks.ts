import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchBlocks,
  fetchBlocksPaginated,
  fetchBlockByHeight,
  fetchBlockByHash,
  fetchNetworkState,
  findBlockOffsetRest,
  restAvailable,
  type BlockFilter,
} from '@/services/api';
import { fetchEpochInfo, type EpochInfo } from '@/services/api/daemon';
import { useNetwork } from './useNetwork';
import { useRequestGeneration } from './useRequestGeneration';
import type { BlockSummary, BlockDetail, NetworkState } from '@/types';

interface UseBlocksResult {
  blocks: BlockSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBlocks(limit: number = 25): UseBlocksResult {
  const { network } = useNetwork();
  const gen = useRequestGeneration();
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBlocks = useCallback(async () => {
    const token = gen.next();
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBlocks(limit);
      if (gen.isCurrent(token)) setBlocks(data);
    } catch (err) {
      if (gen.isCurrent(token)) {
        setError(err instanceof Error ? err.message : 'Failed to fetch blocks');
      }
    } finally {
      if (gen.isCurrent(token)) setLoading(false);
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
  const gen = useRequestGeneration();
  const [block, setBlock] = useState<BlockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBlock = async (): Promise<void> => {
      const token = gen.next();
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
        if (gen.isCurrent(token)) {
          setBlock(data);
          if (!data) {
            setError('Block not found');
          }
        }
      } catch (err) {
        if (gen.isCurrent(token)) {
          setError(
            err instanceof Error ? err.message : 'Failed to fetch block',
          );
        }
      } finally {
        if (gen.isCurrent(token)) setLoading(false);
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
  const gen = useRequestGeneration();
  const [networkState, setNetworkState] = useState<NetworkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNetworkState = useCallback(async () => {
    const token = gen.next();
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNetworkState();
      if (gen.isCurrent(token)) setNetworkState(data);
    } catch (err) {
      if (gen.isCurrent(token)) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch network state',
        );
      }
    } finally {
      if (gen.isCurrent(token)) setLoading(false);
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
  /** Total blocks in the history — the page-count denominator and the footer figure. */
  totalBlocks: number;
  page: number;
  totalPages: number;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  refresh: () => void;
  /**
   * Move to the page holding `height`, positioned at the page's midpoint. Resolves to the
   * height actually landed on, or null when the lookup failed or the backend cannot do it.
   */
  jumpToHeight: (height: number) => Promise<number | null>;
  /** True while `jumpToHeight` is resolving an offset. */
  jumping: boolean;
  /**
   * The height the page grid is currently centred on, or null on the plain grid.
   *
   * Centring costs a short page 1 (see `pageRange`), which is worth disclosing rather than
   * leaving as an unexplained 11-row page — so the page can say what it is centred on and
   * offer a way back.
   */
  centeredOn: number | null;
}

interface PaginatedBlocksOptions {
  pageSize?: number;
  filter?: BlockFilter;
}

/**
 * The rows page `p` covers, given a page size and a grid shift.
 *
 * With `shift === 0` this is the plain uniform grid the page has always used.
 *
 * A non-zero shift is set only by a height jump, to put the target row at a page's
 * midpoint. The remainder it creates has to go somewhere, and PAGE 1 IS MADE SHORT to hold
 * it: page 1 covers `[0, shift)`, page 2 starts at `shift`, and every page after that is
 * full. The pages therefore still tile `[0, total)` — no row is unreachable and none is
 * shown twice.
 *
 * The obvious alternative — sliding every boundary down, page 1 included — is what this
 * replaces, and it silently hides rows: with a shift of 11, page 1 started at row 11 and
 * the eleven NEWEST blocks could not be reached from any page, "First page" included.
 * Putting the remainder in page 1's tail instead would make one page up to twice the size
 * the user asked for.
 */
function pageRange(
  page: number,
  pageSize: number,
  shift: number,
): { offset: number; count: number } {
  if (shift === 0) return { offset: (page - 1) * pageSize, count: pageSize };
  if (page === 1) return { offset: 0, count: shift };
  return { offset: shift + (page - 2) * pageSize, count: pageSize };
}

/** How many pages `total` rows make under the same grid. */
function pageCount(total: number, pageSize: number, shift: number): number {
  if (total <= 0) return 1;
  if (shift === 0) return Math.max(1, Math.ceil(total / pageSize));
  // `Math.max(0, ...)` and not `Math.max(1, ...)`: when the whole list fits in the short
  // page 1 there is no page 2, and flooring the remainder to 1 would advertise an empty
  // one. Unreachable today — `jumpToHeight` only sets a shift when total >= pageSize >
  // shift — but the two functions have to agree for any input, not just the reachable ones.
  return 1 + Math.max(0, Math.ceil((total - shift) / pageSize));
}

export function usePaginatedBlocks(
  options: PaginatedBlocksOptions = {},
): UsePaginatedBlocksResult {
  const { pageSize = 25, filter = 'all' } = options;
  const { network } = useNetwork();
  const gen = useRequestGeneration();
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [jumping, setJumping] = useState(false);

  /**
   * Everything that decides WHICH rows to fetch, in one state value.
   *
   * Two separate effects used to drive this — one resetting on network/page-size change and
   * one firing on page change — and they ping-ponged through `totalBlocks`: the reset set it
   * to 0, the fetch set it back, and the second effect saw a change and fetched the same
   * page again. Every page-1 load therefore went out twice. That was invisible at 25 rows
   * and one request; at 200 rows it is eight.
   *
   * With one descriptor there is one effect and one fetch per user action.
   *
   * - `key` identifies the LIST (network, page size, filter). When it changes the page
   *   resets, because a page number means nothing against a different list — and the REST
   *   `totalCount` really is different per filter (measured on mesa, since retired:
   *   17 130 for `all`, 15 777 for `canonical`).
   * - `shift` moves the page grid so a jumped-to height can sit mid-page — see `pageRange`
   *   for how the pages still tile the list. Zero is the default and reproduces the
   *   original behaviour exactly. Page NUMBERS stay counted from the tip either way, so
   *   "page 8 432 of 8 500" still says where in the chain you are.
   * - `nonce` exists so Refresh can re-fetch a page it is already on.
   */
  const listKey = `${network.id}|${pageSize}|${filter}`;
  const [view, setView] = useState<{
    key: string;
    page: number;
    shift: number;
    nonce: number;
    centeredOn: number | null;
  }>({
    key: listKey,
    page: 1,
    shift: 0,
    nonce: 0,
    centeredOn: null,
  });

  // Adjusting state during render, rather than in an effect: React discards this render and
  // re-runs the component immediately, so the fetch effect below never once fires with a
  // page number belonging to the previous list.
  if (view.key !== listKey) {
    setView({ key: listKey, page: 1, shift: 0, nonce: 0, centeredOn: null });
  }
  const { page, shift } = view;

  /**
   * The current total, mirrored outside React state.
   *
   * The archive branch needs it to place its height cursor, but reading it from state would
   * put it in the fetch effect's dependencies — and since each fetch WRITES it, that is the
   * ping-pong above rebuilt. A ref is read at fetch time and never schedules anything.
   */
  const totalRef = useRef(0);
  /** Which list `totalRef` was measured against, so a stale total is never reused. */
  const totalKeyRef = useRef(listKey);
  /**
   * The live list key, readable from an async callback after an `await`.
   *
   * Written during render, so it is always the key of the most recent render — which is
   * what `jumpToHeight` needs to decide whether the list moved under its search.
   */
  const listKeyRef = useRef(listKey);
  listKeyRef.current = listKey;

  // Never below 1: a not-yet-loaded or single-page list still needs a page 1 for `goToPage`
  // to accept — unclamped, `totalPages === 0` made goToPage reject every value.
  const totalPages = pageCount(totalBlocks, pageSize, shift);

  useEffect(() => {
    // A new list: drop the previous list's total so it cannot be used as a cursor or a
    // denominator for this one. Keyed on the LIST, not on "are we on page 1" — the latter
    // also zeroed the total every time the user merely navigated back to page 1, which
    // blanked the "N total blocks" line and collapsed the pager mid-load.
    if (totalKeyRef.current !== view.key) {
      totalKeyRef.current = view.key;
      totalRef.current = 0;
      setTotalBlocks(0);
    }

    const token = gen.next();
    setLoading(true);
    setError(null);

    const { offset, count } = pageRange(view.page, pageSize, view.shift);

    // The page NUMBER goes to the backend, not a height cursor. The archive still needs a
    // cursor and derives one itself from the known total; the REST backend pages by offset
    // and ignores it. Keeping that arithmetic here applied the archive's assumptions —
    // dense heights starting at 1 — to both backends.
    fetchBlocksPaginated(count, view.page, totalRef.current, {
      offset,
      filter,
    })
      .then(data => {
        if (!gen.isCurrent(token)) return;
        setBlocks(data.blocks);
        setHasMore(data.hasMore);
        // Trust the total from page 1, or any page while we still have none.
        if (view.page === 1 || totalRef.current === 0) {
          totalRef.current = data.totalBlocks;
          setTotalBlocks(data.totalBlocks);
        }
      })
      .catch((err: unknown) => {
        if (!gen.isCurrent(token)) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch blocks');
      })
      .finally(() => {
        if (gen.isCurrent(token)) setLoading(false);
      });
    // `view` is one object identity per intended request, so this is exactly one fetch per
    // user action. `pageSize`/`filter` are already folded into `view.key`.
  }, [view]);

  const goToPage = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setView(v => (v.page === newPage ? v : { ...v, page: newPage }));
      }
    },
    [totalPages],
  );

  const nextPage = useCallback(() => {
    setView(v => (v.page < totalPages ? { ...v, page: v.page + 1 } : v));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setView(v => (v.page > 1 ? { ...v, page: v.page - 1 } : v));
  }, []);

  const refresh = useCallback(() => {
    setView(v => ({
      ...v,
      page: 1,
      shift: 0,
      nonce: v.nonce + 1,
      centeredOn: null,
    }));
  }, []);

  const jumpToHeight = useCallback(
    async (height: number): Promise<number | null> => {
      // Offset-addressed reads are a REST-backend capability; the archive branch has only
      // a height cursor built on a tip-height-as-row-count approximation.
      if (!restAvailable()) return null;
      const jumpKey = listKey;
      setJumping(true);
      try {
        const {
          offset,
          totalBlocks: total,
          found,
        } = await findBlockOffsetRest(height, filter);
        // `found` is false when the height is not in THIS list — most often because the
        // filter excludes it. Refusing is the whole point: the search clamps, so without
        // this the page would centre on the nearest row and present it as the block the
        // user asked for. Under `orphaned` on mainnet that is almost every height typed.
        if (total === 0 || !found) return null;

        // Put the target at the page midpoint, then clamp so neither end of the list is
        // paged past: near the tip the target simply sits nearer the top of the page, and
        // near the oldest block, nearer the bottom. Both beat returning a short page.
        const half = Math.floor(pageSize / 2);
        const start = Math.min(
          Math.max(0, offset - half),
          Math.max(0, total - pageSize),
        );

        // Solve `pageRange` for the page whose window begins at `start`. A start already on
        // the uniform grid needs no shift at all, which keeps the common case — jumping to
        // a height that happens to land on a boundary — on the plain grid.
        const nextShift = start % pageSize;
        const nextPageNum =
          nextShift === 0
            ? start / pageSize + 1
            : (start - nextShift) / pageSize + 2;

        // The offset search takes several round trips, and the list can change underneath
        // it — switching network, filter or page size mid-jump would otherwise apply a page
        // number solved against the OLD list to the new one, landing somewhere unrelated
        // with no sign anything went wrong. Same reasoning as the `gen` token on the fetch
        // effect.
        //
        // The decision is made from a ref written during render, NOT from a flag set inside
        // the `setView` updater. React does not promise to run an updater before `setState`
        // returns — it happens to today via the eager-state bailout — and it deliberately
        // double-invokes updaters in StrictMode. Reading such a flag would report a jump
        // that DID apply as a failure, showing "no block at that height" over a correct
        // result. The updater keeps its own guard as well, so the unsafe write is impossible
        // either way; this one only decides what to tell the caller.
        if (listKeyRef.current !== jumpKey) return null;

        totalRef.current = total;
        totalKeyRef.current = jumpKey;
        setTotalBlocks(total);
        setView(v =>
          v.key !== jumpKey
            ? v
            : {
                ...v,
                page: nextPageNum,
                shift: nextShift,
                centeredOn: height,
                // Landing on the page already shown must still re-fetch: the shift may have
                // changed even when the page number did not.
                nonce: v.nonce + 1,
              },
        );
        return height;
      } catch {
        return null;
      } finally {
        setJumping(false);
      }
    },
    [filter, pageSize, listKey],
  );

  return {
    blocks,
    loading,
    error,
    hasMore,
    totalBlocks,
    page,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    refresh,
    jumpToHeight,
    jumping,
    centeredOn: view.centeredOn,
  };
}

interface UseEpochInfoResult {
  epochInfo: EpochInfo | null;
  loading: boolean;
}

export function useEpochInfo(): UseEpochInfoResult {
  const { network } = useNetwork();
  const gen = useRequestGeneration();
  const [epochInfo, setEpochInfo] = useState<EpochInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = gen.next();
    setLoading(true);
    fetchEpochInfo()
      .then(data => {
        if (gen.isCurrent(token)) setEpochInfo(data);
      })
      .finally(() => {
        if (gen.isCurrent(token)) setLoading(false);
      });
  }, [network.id]);

  return { epochInfo, loading };
}
