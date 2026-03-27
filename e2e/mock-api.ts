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
 * Setup API mocking for a page
 * Intercepts GraphQL requests and returns fixture data
 */
export async function setupApiMocks(page: Page): Promise<void> {
  if (!shouldMockApi()) {
    return;
  }

  // Mock archive node GraphQL endpoints (all networks)
  // Patterns: *-archive-node-api.gcp.o1test.net, archive-node-api.gcp.o1test.net
  await page.route(
    '**/*archive-node-api.gcp.o1test.net/**',
    handleArchiveRequest,
  );

  // Mock daemon GraphQL endpoints (all networks)
  // Patterns: *-plain-*.gcp.o1test.net/graphql
  await page.route('**/*plain*.gcp.o1test.net/graphql', handleDaemonRequest);

  // Mock CoinGecko price API
  await page.route('**/api.coingecko.com/**', handlePriceRequest);
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

    // Handle block detail queries (with userCommands or zkappCommands)
    // Note: feeTransfer alone is not sufficient as block list queries also include it
    if (
      query.includes('blocks') &&
      (query.includes('userCommands') || query.includes('zkappCommands'))
    ) {
      // Check if this is an account transactions query (looking for specific limit like 500)
      const variables = body.variables || {};
      if (variables.limit === 500 || variables.limit >= 100) {
        // This is likely an account transactions query
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(FIXTURE_DATA.accountTransactions),
        });
        return;
      }

      // Otherwise, it's a block detail query
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

    // Handle account queries
    if (query.includes('account')) {
      const variables = body.variables || {};
      const publicKey = variables.publicKey;

      // Return null for invalid accounts
      if (publicKey === FIXTURES.accounts.invalidAccount) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              account: null,
            },
          }),
        });
        return;
      }

      // Return fixture account data
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
