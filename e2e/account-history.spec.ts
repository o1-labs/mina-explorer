import type { Page, Route } from '@playwright/test';
import { test, expect, isMocked, FIXTURES } from './fixtures';

/**
 * #89 — the account transaction history must be honest:
 *  1. A backend failure (HTTP 5xx / timeout on every query tier) must surface
 *     the error state — never the authoritative "No transactions found" copy.
 *  2. The 500-block scan window must be disclosed, in the empty state and
 *     alongside a non-empty list.
 *  3. Fork (non-canonical) blocks can repeat a transaction — it must render
 *     exactly once, deduplicated by hash keeping the highest block.
 * All tests require the mock harness.
 */

// Intercept only the account-history archive queries (SearchTransaction /
// SearchTransactionFlat / SearchTransactionBasic); everything else falls back
// to the standard fixture mocks registered by e2e/fixtures.ts.
async function routeAccountTxQueries(
  page: Page,
  handler: (route: Route) => Promise<void>,
): Promise<void> {
  await page.route('**/*archive-node-api.gcp.o1test.net/**', async route => {
    const postData = route.request().postData() || '';
    if (postData.includes('SearchTransaction')) {
      await handler(route);
      return;
    }
    await route.fallback();
  });
}

const DUP_HASH = 'CkpDuplicateForkTx111111111111111111111111111111111111';

// The same payment included in a canonical block and a fork block at a lower
// height — the archive `blocks` query returns both.
const duplicateTxResponse = {
  data: {
    blocks: [
      {
        blockHeight: 432150,
        stateHash: '3NKcanonicalBlockHashAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        dateTime: '2026-07-14T12:00:00.000Z',
        transactions: {
          userCommands: [
            {
              hash: DUP_HASH,
              kind: 'PAYMENT',
              from: FIXTURES.accounts.blockProducer,
              to: FIXTURES.accounts.knownAccount,
              amount: '1000000000',
              fee: '10000000',
              memo: '',
              nonce: 1,
              failureReason: null,
            },
          ],
          zkappCommands: [],
        },
      },
      {
        blockHeight: 432149,
        stateHash: '3NKforkBlockHashBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        dateTime: '2026-07-14T11:57:00.000Z',
        transactions: {
          userCommands: [
            {
              hash: DUP_HASH,
              kind: 'PAYMENT',
              from: FIXTURES.accounts.blockProducer,
              to: FIXTURES.accounts.knownAccount,
              amount: '1000000000',
              fee: '10000000',
              memo: '',
              nonce: 1,
              failureReason: null,
            },
          ],
          zkappCommands: [],
        },
      },
    ],
  },
};

test.describe('account transaction history honesty (#89)', () => {
  test('backend failure shows the error state, not "No transactions found"', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    // Every account-history query tier fails with HTTP 500.
    await routeAccountTxQueries(page, route =>
      route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Internal Server Error',
      }),
    );

    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // The error UI must render...
    await expect(page.getByText(/HTTP error: 500/)).toBeVisible({
      timeout: 20000,
    });
    // ...and the empty-state copy must NOT be presented as fact.
    await expect(
      page.getByText(/No transactions found for this account/),
    ).not.toBeVisible();
  });

  test('empty history discloses the 500-block search window', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    // Successful query, genuinely no transactions.
    await routeAccountTxQueries(page, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { blocks: [] } }),
      }),
    );

    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // Empty state names the actual window (ACCOUNT_TX_SEARCH_WINDOW = 500).
    await expect(
      page.getByText(
        /No transactions found for this account in the most recent 500 blocks/,
      ),
    ).toBeVisible({ timeout: 20000 });
    // The header discloses the window too.
    await expect(
      page.getByText(/0 transactions found in the most recent 500 blocks/),
    ).toBeVisible();
  });

  test('a transaction repeated in a fork block renders exactly once', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    await routeAccountTxQueries(page, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(duplicateTxResponse),
      }),
    );

    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // Non-empty list also discloses the search window.
    await expect(
      page.getByText(/1 transactions found in the most recent 500 blocks/),
    ).toBeVisible({ timeout: 20000 });

    // Exactly one row for the duplicated hash...
    const rows = page.locator('a', { hasText: DUP_HASH.slice(0, 16) });
    await expect(rows).toHaveCount(1);
    // ...and it keeps the highest-block (canonical) instance.
    await expect(page.getByRole('link', { name: '#432,150' })).toBeVisible();
  });
});
