/**
 * Test fixtures with real data structure
 * In CI, API requests are mocked using these fixtures
 */

import { test as base, expect } from '@playwright/test';
import blocksFixture from './fixtures/blocks.json' with { type: 'json' };
import blockDetailFixture from './fixtures/block-detail.json' with { type: 'json' };
import accountFixture from './fixtures/account.json' with { type: 'json' };
import transactionsFixture from './fixtures/transactions.json' with { type: 'json' };
import accountTransactionsFixture from './fixtures/account-transactions.json' with { type: 'json' };
import { setupApiMocks, shouldMockApi } from './mock-api';

/**
 * Check if we're running in mocked mode (CI or MOCK_API=true)
 * Use this to skip tests that specifically verify cross-network differences
 */
export const isMocked = shouldMockApi();

/**
 * Custom test fixture that automatically sets up API mocks in CI
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Set up API mocks before each test (only in CI or when MOCK_API=true)
    await setupApiMocks(page);
    await use(page);
  },
});

// Re-export expect for convenience
export { expect };

// Known identifiers for testing
export const FIXTURES = {
  // Known block heights that exist in fixtures
  blocks: {
    // A block height that should always exist
    knownHeight: 432150,
    // A recent block height
    recentHeight: 432148,
  },

  // Known public keys from fixtures
  accounts: {
    // Block producer account - known to exist
    blockProducer: 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg',
    // Another known account
    knownAccount: 'B62qpge4uMq4Vv5Rvc8Gw9qSquUYd6xoW1pz7HQkMSHm6h1o7pvLPAN',
    // Invalid/non-existent account for testing error states
    invalidAccount: 'B62qinvalidaccountaddressthatdoesnotexist12345678901234',
  },

  // State hashes from fixtures
  stateHashes: {
    // A known state hash
    known: '3NKeMoncuHab5ScarV5ViyF16cJPT4taWNSaTLS64Dp67wuXigPZ',
  },

  // Transaction hashes from fixtures
  transactions: {
    // A known user command hash
    userCommand: 'CkpZwt1Hy1Dv2HnKfBMwQJRj4hXBRfNVqy8xPZw2TnEq5wDKdJrWp',
    // A known zkApp command hash
    zkAppCommand: '5JuZkApp8jyKPXgVcNnQxD9JKMVLR4GzTxNHr6FqE3mYBdWy7ScPv',
  },
};

// Raw fixture data for mocking API responses
export const FIXTURE_DATA = {
  blocks: blocksFixture,
  blockDetail: blockDetailFixture,
  account: accountFixture,
  transactions: transactionsFixture,
  accountTransactions: accountTransactionsFixture,
};
