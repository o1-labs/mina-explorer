/**
 * API mocking utilities for e2e tests
 * Uses Playwright route interception to return fixture data instead of real API calls
 */

import type { Page, Route } from '@playwright/test';
import { FIXTURE_DATA, FIXTURES } from './fixtures';

/**
 * Check if we should mock API responses (CI environment)
 */
export function shouldMockApi(): boolean {
  return process.env.CI === 'true' || process.env.MOCK_API === 'true';
}

/**
 * URL matchers for the configured networks' endpoints. Specs that install their
 * own route handlers should reuse these instead of hardcoding a hostname.
 *
 * Archive: {devnet-,}archive-node-api.gcp.o1test.net
 * Daemon:  {devnet-,mainnet-}plain-1.gcp.o1test.net/graphql
 *
 * Both live networks sit on o1test.net today; `minaprotocol.com` stays in the
 * alternation because the endpoints have moved between the two host families
 * before (mesa, since decommissioned, served from minaprotocol.com) and a
 * matcher that silently stops matching is worse than one that is too broad.
 */
export const ARCHIVE_URL =
  /\/\/[\w.-]*archive-node-api[\w.-]*\.(o1test\.net|minaprotocol\.com)\//;
export const DAEMON_URL =
  /\/\/[\w.-]*plain[\w.-]*\.(o1test\.net|minaprotocol\.com)\/graphql/;

/**
 * The mina-explorer-api read proxy (`restEndpoint` in networks.ts).
 *
 * Matched on the `/{network}/v1/` PATH shape rather than a hostname, so a spec that points
 * a network at some other proxy deployment is still intercepted. The network segment is
 * part of the API's route, not a query parameter — `/mina-mainnet/v1/blocks`.
 */
export const REST_URL = /\/mina-[a-z0-9-]+\/v1\//;

/**
 * Setup API mocking for a page
 * Intercepts GraphQL requests and returns fixture data
 */
export async function setupApiMocks(page: Page): Promise<void> {
  if (!shouldMockApi()) {
    return;
  }

  // Mock mina-explorer-api REST endpoints. Registered FIRST because Playwright runs the
  // most recently added matching handler first and these patterns do not overlap anyway;
  // keeping REST at the top makes the read-path migration the obvious first thing here.
  await page.route(REST_URL, handleRestRequest);

  // Mock archive node GraphQL endpoints (all networks)
  await page.route(ARCHIVE_URL, handleArchiveRequest);

  // Mock daemon GraphQL endpoints (all networks)
  await page.route(DAEMON_URL, handleDaemonRequest);

  // Mock CoinGecko price API
  await page.route('**/api.coingecko.com/**', handlePriceRequest);
}

/**
 * The blocks list as mina-explorer-api serves it, DERIVED FROM THE ARCHIVE FIXTURE.
 *
 * This is the whole design of the REST mock, and it is deliberate: the same ten blocks in
 * `fixtures/blocks.json` feed both backends, so a spec asserting on rendered block content
 * passes identically whether the network is on the archive or on REST. Hand-writing a
 * second fixture would let the two drift, and then a spec passing would stop meaning the
 * two backends agree — which is the ONE thing this migration has to keep proving.
 *
 * The transformation mirrors the API's own block-list mapper, so the shape below is a
 * statement of what the app expects from it:
 *
 * - `creator` -> `accountAddress`
 * - ISO `dateTime` -> `timestamp`, epoch MILLISECONDS
 * - `blockHeight <= canonicalMaxBlockHeight` -> `isCanonical` (the API's rule R5, and the
 *   same rule this app applies in `heightChainStatus`)
 * - nanomina `coinbase` string -> MINA double
 * - `transactionsCount` counts USER commands only, which is why these fixture blocks
 *   report 0: they carry zkapp commands and fee transfers, neither of which counts.
 * - `txFees`/`snarkFees` are absent from the list DTO entirely — see the note on
 *   `mapRestBlockToSummary` for why they are left undefined rather than zeroed.
 */
function buildRestBlocksPage(params: URLSearchParams): unknown {
  const source = FIXTURE_DATA.blocks.data;
  const canonicalMax =
    source.networkState.maxBlockHeight.canonicalMaxBlockHeight;

  const all = source.blocks.map(block => {
    const consensus = block.protocolState?.consensusState;
    const coinbase = block.transactions?.coinbase;
    return {
      accountAddress: block.creator,
      accountImg: null,
      accountName: null,
      blockHeight: block.blockHeight,
      coinbase: coinbase == null ? null : Number(coinbase) / 1e9,
      epoch: consensus?.epoch ?? null,
      globalSlotSinceGenesis: consensus?.slotSinceGenesis ?? null,
      isCanonical: block.blockHeight <= canonicalMax,
      slot: consensus?.slot ?? null,
      stateHash: block.stateHash,
      timestamp: Date.parse(block.dateTime),
      transactionsCount: block.transactions?.userCommands?.length ?? 0,
    };
  });

  // Honour the filter rather than always returning everything: `type` is what distinguishes
  // the best-chain window from the k-finalized prefix, and a mock that ignored it would
  // happily pass the very bug this fixture exists to catch (asking for CANONICAL and
  // rendering a list 290 blocks stale).
  //
  // The three values PARTITION the list on `isCanonical` — measured against production on
  // 2026-08-27, `CANONICAL.totalCount + ORPHANED.totalCount === ALL.totalCount` exactly on
  // devnet and mainnet (and on mesa, before it was retired). `ORPHANED` returning [] here
  // was the earlier reading, and it is wrong twice over: orphans ARE in `ALL` (one 50-row
  // page spanned only 41 distinct heights when measured), and
  // `ORPHANED` is the whole complement of canonical, live tip included.
  const type = params.get('type') ?? 'ALL';
  const filtered =
    type === 'CANONICAL'
      ? all.filter(b => b.isCanonical)
      : type === 'ORPHANED'
        ? all.filter(b => !b.isCanonical)
        : all;

  // The API rejects size > 50 with a 400 rather than clamping, so the app never asks for
  // more; a mock that quietly served 200 rows would hide a broken chunked fetch.
  const size = Number(params.get('size') ?? 25);
  const page = Number(params.get('page') ?? 0);
  const ordered =
    params.get('orderBy') === 'ASC'
      ? [...filtered].sort((a, b) => a.blockHeight - b.blockHeight)
      : [...filtered].sort((a, b) => b.blockHeight - a.blockHeight);
  const slice = ordered.slice(page * size, page * size + size);

  return {
    data: slice,
    totalElements: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    totalCount: filtered.length,
    size,
    number: page,
    numberOfElements: slice.length,
    first: page === 0,
    last: (page + 1) * size >= filtered.length,
    empty: slice.length === 0,
  };
}

/**
 * Handle mina-explorer-api REST requests.
 *
 * Dispatches on the URL PATH — unlike the GraphQL handlers above, which have to
 * substring-match query text because every GraphQL call is a POST to one URL.
 *
 * An unrecognised path deliberately does NOT `route.continue()`: continuing would let a
 * test silently reach the real proxy over the network, and a spec that quietly depends on
 * production is worse than one that fails. Anything unmapped gets a 404 in the API's own
 * error shape, which is what the app's `getJson` is written to surface.
 */
async function handleRestRequest(route: Route): Promise<void> {
  const url = new URL(route.request().url());

  // `/{network}/v1/<rest>` — strip the two leading segments to get the API path.
  const match = url.pathname.match(/\/mina-[a-z0-9-]+\/v1\/(.*)$/);
  const path = match ? match[1] : '';

  if (path === 'blocks') {
    // Mirror the real ceiling: the API answers 400 on size > 50 (measured — it does NOT
    // clamp), so a client bug that asked for a 200-row page must fail here too rather than
    // being papered over by a mock with no limit.
    const size = Number(url.searchParams.get('size') ?? 25);
    if (!Number.isInteger(size) || size < 1 || size > 50) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ status: 400, error: 'Bad Request' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildRestBlocksPage(url.searchParams)),
    });
    return;
  }

  await route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({
      error: `mock-api: no REST handler for /v1/${path}`,
    }),
  });
}

/**
 * Generate mock analytics data for testing
 */
function generateAnalyticsData(): { data: { blocks: unknown[] } } {
  const blocks = [];
  const now = new Date();

  // Generate 7 days of block data
  for (let d = 0; d < 7; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);

    // Generate ~20 blocks per day
    for (let b = 0; b < 20; b++) {
      const blockDate = new Date(date);
      blockDate.setHours(Math.floor((b / 20) * 24));

      blocks.push({
        blockHeight: 432150 - d * 20 - b,
        dateTime: blockDate.toISOString(),
        txFees: '100000000', // 0.1 MINA
        transactions: {
          userCommands: [{ hash: 'CkpMock...' }],
          zkappCommands: d % 2 === 0 ? [{ hash: 'CkpZk...' }] : [],
        },
      });
    }
  }

  return { data: { blocks } };
}

/**
 * Generate mock staking/block producer data for testing
 */
function generateStakingData(): {
  data: {
    blocks: { creator: string; blockHeight: number; dateTime: string }[];
  };
} {
  const blocks = [];
  const now = new Date();
  const producers = [
    'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg',
    'B62qpge4uMq4Vv5Rvc8Gw9qSquUYd6xoW1pz7HQkMSHm6h1o7pvLPAN',
    'B62qkRodi7nj6W1geB12UuW2XAx2yidWZCcDthJvkf9G4A6G5GFasVQ',
  ];

  // Generate 7 days of block data
  for (let d = 0; d < 7; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);

    // Generate ~20 blocks per day, distributed among producers
    for (let b = 0; b < 20; b++) {
      const blockDate = new Date(date);
      blockDate.setHours(Math.floor((b / 20) * 24));

      blocks.push({
        creator: producers[b % producers.length],
        blockHeight: 432150 - d * 20 - b,
        dateTime: blockDate.toISOString(),
      });
    }
  }

  return { data: { blocks } };
}

/**
 * Mock CoinGecko price data
 */
const MOCK_PRICE_DATA = {
  'mina-protocol': {
    usd: 0.5432,
    eur: 0.4987,
    usd_24h_change: 2.35,
    eur_24h_change: 2.12,
  },
};

/**
 * Handle CoinGecko price API requests
 */
async function handlePriceRequest(route: Route): Promise<void> {
  const url = route.request().url();

  // Current price request
  if (url.includes('/simple/price')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PRICE_DATA),
    });
    return;
  }

  // Historical price request
  if (url.includes('/history')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        market_data: {
          current_price: {
            usd: 0.52,
            eur: 0.48,
          },
        },
      }),
    });
    return;
  }

  await route.continue();
}

/**
 * Handle archive node GraphQL requests
 */
async function handleArchiveRequest(route: Route): Promise<void> {
  const request = route.request();
  const postData = request.postData();

  if (!postData) {
    await route.continue();
    return;
  }

  try {
    const body = JSON.parse(postData);
    const query = body.query || '';

    // Handle analytics queries (includes txFees or BlocksAnalytics in query name)
    if (query.includes('BlocksAnalytics') || query.includes('txFees')) {
      // Generate mock analytics data
      const analyticsData = generateAnalyticsData();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(analyticsData),
      });
      return;
    }

    // Handle staking/block producers queries (date range with creator field)
    if (
      query.includes('GetBlocksByDateRange') ||
      (query.includes('dateTime_gte') && query.includes('creator'))
    ) {
      const stakingData = generateStakingData();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stakingData),
      });
      return;
    }

    // Handle transaction search queries (full, flat, and paginated)
    if (
      query.includes('GetTransactions') ||
      query.includes('GetTransactionsPaginated') ||
      query.includes('SearchTransactionFlat') ||
      query.includes('GetZkAppActivityFlat')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXTURE_DATA.confirmedTransactions),
      });
      return;
    }

    // Handle block detail queries (with userCommands or zkappCommands)
    if (
      query.includes('blocks') &&
      (query.includes('userCommands') || query.includes('zkappCommands'))
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXTURE_DATA.blockDetail),
      });
      return;
    }

    // Handle blocks list queries
    if (query.includes('blocks')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXTURE_DATA.blocks),
      });
      return;
    }

    // Handle network state queries
    if (query.includes('networkState')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            networkState: FIXTURE_DATA.blocks.data.networkState,
          },
        }),
      });
      return;
    }

    // Default: continue with real request
    await route.continue();
  } catch {
    await route.continue();
  }
}

/**
 * Handle daemon GraphQL requests
 */
async function handleDaemonRequest(route: Route): Promise<void> {
  const request = route.request();
  const postData = request.postData();

  if (!postData) {
    await route.continue();
    return;
  }

  try {
    const body = JSON.parse(postData);
    const query = body.query || '';

    // Handle broadcast mutations
    if (query.includes('sendPayment')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sendPayment: {
              payment: {
                hash: 'CkpMockPaymentHash12345678901234567890123456789012',
              },
            },
          },
        }),
      });
      return;
    }

    if (query.includes('sendDelegation')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sendDelegation: {
              delegation: {
                hash: 'CkpMockDelegationHash234567890123456789012345678901',
              },
            },
          },
        }),
      });
      return;
    }

    if (query.includes('sendZkapp')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sendZkapp: {
              zkapp: {
                hash: 'CkpMockZkAppHash345678901234567890123456789012345',
              },
            },
          },
        }),
      });
      return;
    }

    // Consensus time now — the wall-clock slot shown in the app-wide bar.
    // Checked before 'bestChain'/'account' only for symmetry with the rest of
    // this chain; the query shares no substring with either.
    //
    // The slot window is pinned to the CURRENT time rather than to the fixture's
    // timestamps: the bar advances the slot locally from `startTime`, and a
    // window in the distant past would make it tick out an absurd slot number.
    if (query.includes('daemonStatus')) {
      // 90 s on both live networks since the mesa hard fork. The epoch/slot the
      // specs assert come from `slotsPerEpoch` and the pinned `globalSlot`, not
      // from this, so it is here to match a real daemon rather than to be read.
      const SLOT_DURATION = 90_000;
      const slotStart = Math.floor(Date.now() / SLOT_DURATION) * SLOT_DURATION;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            daemonStatus: {
              consensusTimeNow: {
                // 61 * 7140 + 3570 — consistent with the epoch/slot the
                // bestChain mock reports, one slot ahead of the best tip.
                globalSlot: '439110',
                startTime: String(slotStart),
                endTime: String(slotStart + SLOT_DURATION),
              },
              consensusTimeBestTip: { globalSlot: '439109' },
              globalSlotSinceGenesisBestTip: 1003589,
              consensusConfiguration: {
                slotsPerEpoch: 7140,
                slotDuration: SLOT_DURATION,
                // The daemon's own format: a space instead of `T` and six
                // fractional digits, which is NOT valid ISO-8601. Kept verbatim
                // so the parser is exercised, not bypassed.
                genesisStateTimestamp: '2024-06-05 00:00:00.000000Z',
              },
            },
          },
        }),
      });
      return;
    }

    // Handle bestChain queries (daemon epoch info + transaction listing)
    // Must be checked before 'account' since bestChain queries contain 'accountUpdates'
    if (query.includes('bestChain')) {
      // Epoch info query (small bestChain with protocolState)
      if (query.includes('epoch') || query.includes('slot')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              bestChain: [
                {
                  protocolState: {
                    consensusState: {
                      blockHeight: '432150',
                      epoch: '61',
                      slot: '3570',
                      slotSinceGenesis: '436710',
                    },
                  },
                },
              ],
            },
          }),
        });
        return;
      }

      // Transaction listing query — return confirmed transactions fixture
      // Remap archive format to daemon bestChain format
      const blocks = FIXTURE_DATA.confirmedTransactions.data.blocks;
      const bestChain = blocks.map(
        (b: {
          blockHeight: number;
          dateTime: string;
          transactions: object;
        }) => ({
          stateHash: `3NK${b.blockHeight}`,
          protocolState: {
            consensusState: { blockHeight: String(b.blockHeight) },
            blockchainState: {
              date: String(new Date(b.dateTime).getTime()),
            },
          },
          transactions: b.transactions,
        }),
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { bestChain } }),
      });
      return;
    }

    // Handle daemon block(height) queries
    if (query.includes('block(height')) {
      const chain = FIXTURE_DATA.confirmedTransactions.data.bestChain;
      const block = chain[chain.length - 1]; // newest block
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            block: {
              transactions: {
                coinbase: '720000000000',
                ...block.transactions,
                feeTransfer: [],
              },
            },
          },
        }),
      });
      return;
    }

    // Handle account queries
    if (query.includes('account')) {
      const variables = body.variables || {};
      const publicKey = variables.publicKey;

      if (publicKey === FIXTURES.accounts.invalidAccount) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { account: null } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXTURE_DATA.account),
      });
      return;
    }

    // Handle pooled transactions queries
    if (
      query.includes('pooledUserCommands') ||
      query.includes('pooledZkappCommands')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXTURE_DATA.transactions),
      });
      return;
    }

    // Default: continue with real request
    await route.continue();
  } catch {
    await route.continue();
  }
}
