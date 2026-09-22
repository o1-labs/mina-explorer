/**
 * mina-explorer-api REST transport.
 *
 * A second read backend alongside the Archive-Node-API GraphQL client. Where the archive
 * is a schema that varies by deployment — which is why `blocks.ts` and `transactions.ts`
 * carry FULL/BASIC/MINIMAL degradation, nested/FLAT/BASIC zkApp tiering and the
 * `bestChainFilter` support probe — this backend is ONE pinned, versioned contract with a
 * published compatibility matrix. So code that reads through here does not tier, does not
 * sniff error strings, and does not keep a per-endpoint capability allowlist.
 *
 * ## The endpoint is a PROXY, and that is load-bearing
 *
 * mina-explorer-api requires an `x-api-key` header on every route. This app is a static
 * bundle on GitHub Pages: anything shipped to the browser is readable from the network tab,
 * so the key CANNOT live here. `restEndpoint` therefore points at a small reverse proxy that
 * holds the key server-side and forwards to the API.
 *
 * Consequences worth stating, because "just add the header here" is the obvious wrong turn:
 *
 * - **No credential is ever set in this module.** If you find yourself adding one, the
 *   design has been misread — put it in the proxy.
 * - Requests stay header-free beyond `Accept`, which also keeps them CORS-simple and avoids
 *   a preflight on every call.
 * - Abuse is bounded by the API key's own per-minute limit, which is a global cap precisely
 *   because nobody but the proxy holds the key, plus caching at the proxy.
 *
 * `restEndpoint` includes the network path segment (e.g. `.../mina-devnet`) rather than
 * being a bare host, so there is no second id-mapping table to keep in sync with
 * `networks.ts` — this app's ids (`devnet`, `mainnet`) are not the API's (`mina-devnet`,
 * `mina-mainnet`), and a mapping table is a thing that goes stale silently.
 *
 * The endpoint is held in a module-level singleton set from NetworkContext, mirroring
 * `daemon.ts` exactly — see the note at daemon.ts:3-12 for why that is deliberate (#88).
 *
 * ## A note on the measurements below
 *
 * Several comments in this file cite figures measured on **mesa**, a testnet that has since
 * been decommissioned and removed from `networks.ts`. They are kept because they are the
 * worked examples that explain why this code is shaped as it is — a short chain whose
 * archive did not start at height 1 is exactly the case the naive arithmetic gets wrong.
 * They are historical evidence, not reproducible against any network this app still lists.
 */

import { ApiError } from './client';
import { fetchWithTimeout } from './http';
import type { BlockSummary } from '../../types/block';

let restEndpoint: string | null = null;

/** Set the active REST base URL (including the network segment), or clear it. */
export function setRestEndpoint(endpoint: string | null | undefined): void {
  restEndpoint = endpoint ?? null;
}

export function getRestEndpoint(): string | null {
  return restEndpoint;
}

/**
 * Whether the active network has a REST backend configured.
 *
 * Callers use this to choose a backend, so it is the ONLY switch: a network without a
 * `restEndpoint` keeps the archive path untouched. That is what makes this rollout
 * per-network and reversible by config rather than by a redeploy.
 */
export function restAvailable(): boolean {
  return restEndpoint !== null && restEndpoint !== '';
}

async function getJson<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  if (!restEndpoint) {
    throw new ApiError('REST endpoint not configured');
  }
  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  const url = `${restEndpoint.replace(/\/$/, '')}${path}?${query.toString()}`;

  const response = await fetchWithTimeout(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    // The API's error bodies are `{"error": "..."}`; fall back to the status line when the
    // body is absent or unparseable (a 406 is served with ZERO bytes by contract).
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* keep the status-line detail */
    }
    throw new ApiError(`mina-explorer-api: ${detail}`);
  }
  return (await response.json()) as T;
}

/**
 * The API's hard ceiling on `size`, and it is a HARD one.
 *
 * `size=51` answers **HTTP 400**, body `{"status":400,"error":"Bad Request"}` — it does not
 * clamp, and it does not return 50. (An earlier revision of this file documented a silent
 * clamp; measured against production on 2026-08-27, that is not what happens. A page-size
 * option of 100 wired straight through would therefore have produced an error box, not a
 * short page.)
 *
 * So any page larger than this is ASSEMBLED from several requests — see
 * `fetchBlocksRangeRest`.
 */
export const REST_MAX_PAGE_SIZE = 50;

/**
 * The canonicality filter offered on /#/blocks, and how it maps onto the API's `type`.
 *
 * The three `type` values partition the history on `isCanonical` — measured 2026-08-27:
 *
 * | network | `ALL` | `CANONICAL` | `ORPHANED` |
 * |---|---|---|---|
 * | mesa (retired) | 17 130 | 15 777 | 1 353 |
 * | mainnet | 547 728 | 546 456 | 1 272 |
 *
 * `CANONICAL + ORPHANED === ALL` on both, exactly. That matters for paging: `totalCount`
 * moves with the filter, so the page count stays honest instead of being a count of one
 * list divided into another.
 *
 * `canonical` is the filter that answers "hide the fork noise": it drops both the orphan
 * siblings that share a height with a real block and the ~290-block unfinalized window at
 * the tip. Its newest row is therefore ~290 blocks / 13–35 h behind the tip BY DEFINITION,
 * which is a property of finality, not staleness — but it is surprising enough that
 * `BlocksPage` says so on screen when the filter is on.
 */
export type BlockFilter = 'all' | 'canonical' | 'orphaned';

const FILTER_TO_TYPE: Record<BlockFilter, string> = {
  all: 'ALL',
  canonical: 'CANONICAL',
  orphaned: 'ORPHANED',
};

/** One item of `GET /{network}/v1/blocks`. Only the fields this app consumes. */
interface RestBlockListItem {
  blockHeight: number;
  stateHash: string;
  accountAddress: string | null;
  timestamp: number;
  isCanonical: boolean;
  coinbase: number | null;
  transactionsCount: number | null;
  epoch: number | null;
  slot: number | null;
  globalSlotSinceGenesis: number | null;
}

/**
 * The Envelope-A page wrapper (`data`-keyed, with `totalCount`).
 *
 * ## Read `totalCount`, NOT `totalElements` or `totalPages`
 *
 * These three disagree, on purpose, and picking the wrong one silently truncates the list:
 *
 * - **`totalCount`** is the true number of rows. Use this.
 * - **`totalElements`** is CAPPED AT 10 000, mirroring Blockberry's own blocks list. It is a
 *   parity artefact, not a count.
 * - **`totalPages`** derives from the capped `totalElements`, so it reports 400 pages of 25
 *   regardless of how much data exists.
 * - **`last`** derives from the same cap: `page=399&size=25` answered `"last": true` on
 *   mesa with 286 further pages of real rows behind it. It is not read here, and must not
 *   be.
 *
 * Measured on mesa: `totalCount` 16 876 (675 pages of 25) against `totalPages` 400. Paging
 * past the cap works fine — page 500 returns real rows, page 674 returns 25, page 675
 * returns the final 1 — so a reader that trusted `totalPages` would hide a third of the
 * chain behind a page control that claims it does not exist.
 */
interface RestPage<T> {
  data: T[];
  totalElements: number;
  totalPages: number;
  totalCount?: number;
}

/**
 * A MINA decimal amount -> the nanomina string this app carries internally.
 *
 * THE TWO SIDES DISAGREE ON UNITS, and nothing in the type system says so — both are
 * "a number that means an amount":
 *
 * - mina-explorer-api converts to a MINA double at its response boundary (its rule R6), so
 *   a 720 MINA coinbase arrives as `720.0`.
 * - This app carries nanomina end to end. `BlockSummary.coinbase` is a nanomina STRING, and
 *   `formatMina` — via `Amount` — divides by 1e9 to display it.
 *
 * Handing the MINA value straight through therefore renders 720 MINA as `0.00000072 MINA`.
 * That is not a hypothetical: it is what this mapper did when first written, and it is
 * invisible in review because the mapping line reads perfectly sensibly.
 *
 * Converted via `toFixed(9)` and BigInt arithmetic rather than `Math.round(value * 1e9)`.
 * The multiply agrees on every amount this endpoint currently returns — it was checked, not
 * assumed — but it is a binary float operation on a decimal quantity, so its exactness is a
 * property of the inputs rather than of the code. Coinbase is small and safe today;
 * transaction fees and account balances are the same MINA-double convention and are not.
 * The decimal-string route does not depend on the magnitude at all.
 */
function minaToNanominaString(mina: number): string {
  const [whole, frac = ''] = Math.abs(mina).toFixed(9).split('.');
  const nanomina = BigInt(whole) * 1_000_000_000n + BigInt(frac.padEnd(9, '0'));
  return `${mina < 0 ? '-' : ''}${nanomina}`;
}

/**
 * A REST block-list item -> this app's `BlockSummary`.
 *
 * Two conversions and one deliberate omission:
 *
 * - `timestamp` is epoch MILLISECONDS; `dateTime` is an ISO string everywhere in this app.
 * - `coinbase` arrives as a MINA double and is converted BACK to a nanomina string — see
 *   `minaToNanominaString` for why that round trip is required rather than redundant.
 * - `txFees` / `snarkFees` are NOT SET. The block-list DTO does not carry them, and nothing
 *   renders them in a list — `BlockDetail.tsx:155,159` is the only consumer and it already
 *   guards with `|| '0'`. They are left undefined rather than defaulted to '0' on purpose:
 *   a fabricated zero is indistinguishable from a real zero-fee block, and inventing values
 *   is precisely what this migration must not do. The block DETAIL endpoint does carry them
 *   (`transactionsFee`, `snarkersFee`) for when that surface moves.
 */
export function mapRestBlockToSummary(item: RestBlockListItem): BlockSummary {
  const summary: BlockSummary = {
    blockHeight: item.blockHeight,
    stateHash: item.stateHash,
    creator: item.accountAddress ?? '',
    dateTime: new Date(item.timestamp).toISOString(),
    canonical: item.isCanonical,
  };
  if (item.transactionsCount !== null)
    summary.transactionCount = item.transactionsCount;
  if (item.coinbase !== null)
    summary.coinbase = minaToNanominaString(item.coinbase);
  if (item.epoch !== null) summary.epoch = item.epoch;
  if (item.slot !== null) summary.slot = item.slot;
  if (item.globalSlotSinceGenesis !== null)
    summary.slotSinceGenesis = item.globalSlotSinceGenesis;
  return summary;
}

/**
 * The most recent blocks on the best chain.
 *
 * ## `type: ALL` — and why `CANONICAL` is the trap
 *
 * The API's `type` values do NOT mean what the names suggest to someone arriving from the
 * archive:
 *
 * - `ALL` is **everything the API has**, live tip included — orphaned siblings INCLUDED.
 *   Measured on mesa: one 50-row page spanned only 41 distinct heights, so eight heights
 *   carried a fork sibling. (An earlier revision of this comment claimed orphans were not
 *   in `ALL`. They are; see `BLOCK_FILTERS` for the measurements.)
 * - `CANONICAL` is the **k-FINALIZED** prefix (`blockHeight <= canonicalMaxBlockHeight`).
 *   k is 290 blocks on Mina, so this list *starts* 290 blocks below the tip. Measured
 *   against production: 13 h behind on devnet, **35 h behind on mainnet** (14 h on mesa).
 *   As the front page's "latest blocks" that is the wrong list, and wrong in the quiet
 *   way — every row real and correctly rendered, the whole page just a day and a half
 *   stale. This shipped as `CANONICAL` and was caught before any network was flipped on.
 *   As an EXPLICIT user filter on /#/blocks it is exactly right, which is what
 *   `BlockFilter` exposes.
 * - `ORPHANED` is the complement of `CANONICAL`, not just off-chain siblings: it is every
 *   row with `isCanonical: false`, which includes the ~290-block pending window at the tip.
 *
 * `ALL` is therefore the faithful replacement for what the archive path returns here
 * (`fetchBlocks` asks for the latest blocks with `bestChainOnly: false`).
 *
 * The canonicality badge survives the swap because both backends derive the flag the SAME
 * way — `blockHeight <= canonicalMaxBlockHeight`: the API in its block-list mapper (its
 * rule R5), this app in `heightChainStatus`. Blocks above the canonical max arrive with
 * `isCanonical: false` and render as pending, exactly as they do today.
 *
 * None of this needs a support probe, unlike the archive's `inBestChain` — which some
 * deployments reject and which this app has to sniff for at runtime
 * (`bestChainFilter.ts`). That is the point of the swap.
 *
 * `size` is capped at `REST_MAX_PAGE_SIZE`; see that constant for what exceeding it does.
 */
export async function fetchBlocksRest(
  limit: number = 25,
): Promise<BlockSummary[]> {
  const page = await getJson<RestPage<RestBlockListItem>>('/v1/blocks', {
    page: 0,
    // Clamped rather than passed through: over the ceiling the API answers 400, so an
    // unguarded caller turns a too-large limit into an error box instead of a short list.
    size: Math.min(Math.max(1, limit), REST_MAX_PAGE_SIZE),
    sortBy: 'HEIGHT',
    orderBy: 'DESC',
    type: 'ALL',
  });
  return page.data.map(mapRestBlockToSummary);
}

/** One page of the block history, plus the true total this app pages against. */
export interface RestBlocksPage {
  blocks: BlockSummary[];
  totalBlocks: number;
  hasMore: boolean;
}

/**
 * A page of block history, by OFFSET.
 *
 * ## This replaces height arithmetic, and that is the real win
 *
 * The archive has no offset paging, so `fetchBlocksPaginated` fakes it: the caller computes
 * `cursor = tipHeight - (page - 1) * pageSize` and asks for blocks below that height. That
 * arithmetic silently assumes **heights start at 1 and are dense**, and treats the tip
 * height as a count of blocks.
 *
 * On mesa neither held. Its archive started around height 295 635, so:
 *
 * | | mesa (retired) |
 * |---|---|
 * | tip height | 312 511 |
 * | actual blocks (`totalCount`) | 16 876 |
 * | pages the height math offers | ~12 500 |
 * | pages with data | 675 |
 *
 * So roughly 11 800 of the pages the archive path advertises are empty, and the page footer
 * reports the tip height as "total blocks" — overstating it by about 18x. This endpoint has
 * genuine offset pagination and a genuine row count, so both problems disappear rather than
 * being worked around.
 *
 * `page` is ZERO-based here and one-based in the app, converted at this boundary — the one
 * place that knows both conventions.
 *
 * ## Why this takes an OFFSET and not a page number
 *
 * The API only addresses rows as `page * size`, so it can only start a window on a multiple
 * of the page size. Two things this page needs do not fit that grid:
 *
 * - **Page sizes above `REST_MAX_PAGE_SIZE`** — 100 and 200 have to be stitched from
 *   several ≤50 requests, which are laid out on the 50-grid, not the 100- or 200-grid.
 * - **Centring a page on a block height** — the offset that puts height H in the middle of
 *   the page is whatever it is; it is a multiple of the page size only by accident.
 *
 * Taking an offset moves that arithmetic to ONE place. The single-request case is kept
 * intact as a fast path below, so the ordinary page-1-of-25 request still goes out looking
 * exactly as it did before this function grew an offset.
 */
export async function fetchBlocksRangeRest(
  offset: number,
  count: number,
  filter: BlockFilter = 'all',
): Promise<RestBlocksPage> {
  const start = Math.max(0, Math.trunc(offset));
  const want = Math.max(1, Math.trunc(count));
  const type = FILTER_TO_TYPE[filter];

  // Fast path: the window already sits on the API's own grid and fits one request. This is
  // every page of a ≤50-row unshifted list — i.e. the default view — and it keeps that
  // request byte-identical to the pre-offset one.
  if (want <= REST_MAX_PAGE_SIZE && start % want === 0) {
    const page = await getJson<RestPage<RestBlockListItem>>('/v1/blocks', {
      page: start / want,
      size: want,
      sortBy: 'HEIGHT',
      orderBy: 'DESC',
      type,
    });
    return toBlocksPage(page.data, page, start, want);
  }

  // Otherwise stitch: cover [start, start+want) with 50-row requests laid out on the
  // 50-grid, then slice out the part actually asked for. Requests are issued together —
  // they are independent reads and the proxy caches them, so serialising would only add
  // latency.
  const chunk = REST_MAX_PAGE_SIZE;
  const firstChunk = Math.floor(start / chunk);
  const lastChunk = Math.floor((start + want - 1) / chunk);
  const responses = await Promise.all(
    Array.from({ length: lastChunk - firstChunk + 1 }, (_, i) =>
      getJson<RestPage<RestBlockListItem>>('/v1/blocks', {
        page: firstChunk + i,
        size: chunk,
        sortBy: 'HEIGHT',
        orderBy: 'DESC',
        type,
      }),
    ),
  );

  const rows = responses.flatMap(r => r.data);
  const sliceFrom = start - firstChunk * chunk;
  // Every response carries the same total; the first is as good as any.
  const meta = responses[0] as RestPage<RestBlockListItem>;
  return toBlocksPage(
    rows.slice(sliceFrom, sliceFrom + want),
    meta,
    start,
    want,
  );
}

function toBlocksPage(
  items: RestBlockListItem[],
  meta: RestPage<RestBlockListItem>,
  offset: number,
  count: number,
): RestBlocksPage {
  const blocks = items.map(mapRestBlockToSummary);
  // `totalCount` is the true row count; `totalElements` is capped at 10 000 for Blockberry
  // parity. Fall back to `totalElements` only if the field is absent entirely — better a
  // capped list than none — see the RestPage doc comment.
  const totalBlocks = meta.totalCount ?? meta.totalElements;
  return {
    blocks,
    totalBlocks,
    // Derived from the true total rather than from "did we get a full page", which is wrong
    // on the last page whenever the count divides exactly by the page size.
    hasMore: offset + count < totalBlocks,
  };
}

/**
 * The offset of block height `height` in the height-DESC list under `filter`.
 *
 * ## Why this is a search and not a subtraction
 *
 * `tipHeight - height` is the obvious answer and it is wrong under both filters, in
 * opposite directions:
 *
 * - Under `all`, heights REPEAT — a fork sibling shares its height with the block that beat
 *   it. Measured on mesa, 50 rows spanned 41 heights; near the mainnet tip, 50 rows spanned
 *   33. Subtraction under-shoots by one row per orphan passed.
 * - Under `canonical`/`orphaned` the retained window does not start at height 1 (mesa's
 *   started around 296 000), and `orphaned` is sparse to the point of being unrelated to
 *   height at all.
 *
 * So probe instead. The list is sorted by height descending, hence monotone non-increasing
 * in the offset, which is all an interpolation search needs. Each probe reads one row and
 * rescales the remaining interval by the density it just measured, so it converges far
 * faster than the ~20 probes a plain binary search over 550 000 mainnet rows would take.
 *
 * Measured against production on 2026-08-27, probes to land the height exactly on a page
 * midpoint (the target was at the midpoint in every case):
 *
 * | case | probes | offset found | naive `tip - height` |
 * |---|---|---|---|
 * | mainnet h=100 000 `canonical` | 5 | 446 460 | 446 746 ✗ |
 * | mainnet h=400 000 `all` | 6 | 147 736 | 146 746 ✗ |
 * | mesa (retired) h=300 000 `canonical` | 7 | 12 438 | 12 712 ✗ |
 * | devnet h=545 169 `all` (forked height) | 17 | 6 212 | 4 291 ✗ |
 * | mainnet h=300 000 `orphaned` (absent) | 2 | — `found: false` | — |
 *
 * The dense-fork region near a tip is the slow case at ~3 s; it sits behind an explicit
 * "Go" button with a spinner, which is why probe count is traded for exactness here.
 *
 * ## Interpolation alone is not safe — it is bisection-safeguarded
 *
 * Pure interpolation degrades to ONE ROW PER PROBE on a skewed key distribution, and
 * `orphaned` is exactly that shape: ~290 contiguous heights at the tip and a long sparse
 * tail of fork siblings. Run over a synthetic list of that shape, a plain interpolation
 * search missed 8 of 12 targets inside a 12-probe budget — worst case 20 rows out, which
 * at 20 rows per page puts the target off the page entirely while still LOOKING converged.
 *
 * So whenever a step fails to halve the interval, the next one bisects. That bounds the
 * search at 2·log2(n) probes while leaving the common case — which converges in 4 to 10 —
 * untouched.
 *
 * ## `found` is not decoration
 *
 * The interval clamps: a height above the tip lands at 0, one below the retained window at
 * `total - 1`. Without a found flag those clamps are indistinguishable from a hit, and the
 * caller centres a page on the nearest row and presents it as the block that was asked
 * for. That is not hypothetical — under `orphaned` on mainnet only 1 276 of 547 736 heights
 * are present, so almost any height typed is absent, and heights 300 000, 100 000 and 3 000
 * all clamped to the same row (544 979) and all reported success. `found` says whether the
 * row at `offset` actually carries `height`; `jumpToHeight` refuses the jump when it does
 * not.
 */
export async function findBlockOffsetRest(
  height: number,
  filter: BlockFilter = 'all',
): Promise<{ offset: number; totalBlocks: number; found: boolean }> {
  const probe = async (
    offset: number,
  ): Promise<{ height: number | null; total: number }> => {
    const page = await getJson<RestPage<RestBlockListItem>>('/v1/blocks', {
      page: offset,
      size: 1,
      sortBy: 'HEIGHT',
      orderBy: 'DESC',
      type: FILTER_TO_TYPE[filter],
    });
    const row = page.data[0];
    return {
      height: row ? row.blockHeight : null,
      total: page.totalCount ?? page.totalElements,
    };
  };

  const head = await probe(0);
  const total = head.total;
  if (total === 0 || head.height === null) {
    return { offset: 0, totalBlocks: 0, found: false };
  }
  // At or newer than the tip — the first page is already the answer.
  if (height >= head.height) {
    return { offset: 0, totalBlocks: total, found: height === head.height };
  }

  let lo = 0;
  let loHeight = head.height;
  let hi = total - 1;
  const tail = await probe(hi);
  if (tail.height === null) {
    return { offset: 0, totalBlocks: total, found: false };
  }
  let hiHeight = tail.height;
  // Older than anything retained — clamp to the last row.
  if (height <= hiHeight) {
    return { offset: hi, totalBlocks: total, found: height === hiHeight };
  }

  // `lo` always holds a row NEWER than the target and `hi` one at or OLDER than it, so the
  // answer is always inside (lo, hi]. Each pass strictly narrows that interval — `guess` is
  // clamped into (lo, hi), which the loop condition keeps non-empty — so this terminates.
  //
  // The budget allows two probes per halving, which is what the bisection safeguard needs
  // in the worst case; the common case exits far below it.
  const maxSteps = 2 * Math.ceil(Math.log2(total + 2)) + 8;
  let bisect = false;
  for (let step = 0; step < maxSteps && hi - lo > 1; step++) {
    const width = hi - lo;
    let guess: number;
    if (bisect) {
      guess = lo + Math.floor(width / 2);
    } else {
      const span = loHeight - hiHeight;
      // Interpolate on height, then nudge inside the open interval so a flat run of
      // repeated heights cannot pin the guess to an endpoint and spin.
      const ratio = span > 0 ? (loHeight - height) / span : 0.5;
      guess = lo + Math.round(ratio * width);
    }
    guess = Math.min(hi - 1, Math.max(lo + 1, guess));

    const at = await probe(guess);
    if (at.height === null) break;
    if (at.height > height) {
      lo = guess;
      loHeight = at.height;
    } else {
      hi = guess;
      hiHeight = at.height;
    }
    // An interpolation step that failed to halve the interval is the signature of a skewed
    // key distribution, where interpolation walks one row at a time. Bisect the next one.
    bisect = !bisect && (hi - lo) * 2 > width;
  }

  // `hi` is the first row at or below the target height — the winning block when a fork
  // sibling shares it. It carries `height` itself only if the height is really in this list.
  return { offset: hi, totalBlocks: total, found: hiHeight === height };
}
