/**
 * Regression tests for issue #97: the confirmed-transactions view and the
 * transaction-by-hash search must not present transactions from orphaned
 * fork blocks as confirmed.
 *
 * Reuses the #86 fork fixture: two blocks at height 499998, one on the best
 * chain and one orphaned (listed FIRST so unfiltered flattening surfaces its
 * transaction). The mock emulates the Archive-Node-API server semantics
 * verified against the live endpoints: `inBestChain: true` excludes orphaned
 * fork blocks.
 *
 * This spec sets up its own route mocks (independent of MOCK_API) so it runs
 * deterministically in any environment.
 */

import { test, expect, type Route } from '@playwright/test';
import forkFixture from './fixtures/blocks-fork.json' with { type: 'json' };

const ORPHAN_TX_HASH = 'CkpOrphanedBlockTxXq7RJTujV3ZfyPHZBGrWFUqYuBZXCDQV6En';
const CANONICAL_TX_HASH =
  'CkpCanonicalBlockTxXq7RJTujV3ZfyPHZBGrWFUqYuBZXCDQV6E';
// First-8-char prefixes are unique, so they match both full and truncated
// renderings of each transaction hash.
const ORPHAN_TX_PREFIX = /CkpOrpha/;
const CANONICAL_TX_PREFIX = /CkpCanon/;

const { networkState, blocks: allBlocks } = forkFixture;

async function fulfillJson(route: Route, payload: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

/**
 * Emulate the archive: every block-scan query (GetTransactions,
 * SearchTransaction, block lists) returns all blocks — including the orphaned
 * fork sibling — unless the query filters with `inBestChain: true`.
 */
async function handleArchiveRequest(route: Route): Promise<void> {
  const postData = route.request().postData();
  if (!postData) {
    await route.fulfill({ status: 500, body: '' });
    return;
  }
  const body = JSON.parse(postData);
  const query: string = body.query || '';
  const vars: Record<string, number> = body.variables || {};

  let blocks = allBlocks;
  if (vars.maxBlockHeight !== undefined) {
    blocks = blocks.filter(b => b.blockHeight < vars.maxBlockHeight);
  }
  if (query.includes('inBestChain')) {
    blocks = blocks.filter(b => !b.orphaned);
  }

  const data: Record<string, unknown> = { blocks };
  if (query.includes('networkState')) {
    data.networkState = networkState;
  }
  await fulfillJson(route, { data });
}

/**
 * Emulate the daemon: empty mempool (so the by-hash search falls through to
 * the archive scan) and a minimal bestChain for the header's epoch info.
 */
async function handleDaemonRequest(route: Route): Promise<void> {
  const postData = route.request().postData();
  const query: string = postData ? JSON.parse(postData).query || '' : '';

  if (query.includes('pooledUserCommands')) {
    await fulfillJson(route, { data: { pooledUserCommands: [] } });
    return;
  }

  if (query.includes('pooledZkappCommands')) {
    await fulfillJson(route, { data: { pooledZkappCommands: [] } });
    return;
  }

  if (query.includes('bestChain')) {
    await fulfillJson(route, {
      data: {
        bestChain: [
          {
            protocolState: {
              consensusState: {
                blockHeight: '500000',
                epoch: '12',
                slot: '3000',
                slotSinceGenesis: '90000',
              },
            },
          },
        ],
      },
    });
    return;
  }

  await route.fulfill({ status: 500, body: '' });
}

test.describe('Transaction canonicality on forks (issue #97)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(
      '**/*archive-node-api.gcp.o1test.net/**',
      handleArchiveRequest,
    );
    await page.route('**/*plain*.gcp.o1test.net/graphql', handleDaemonRequest);
    await page.route('**/api.coingecko.com/**', route =>
      fulfillJson(route, {
        'mina-protocol': { usd: 0.5, eur: 0.45 },
      }),
    );
  });

  test('confirmed transactions list excludes orphan-only transactions', async ({
    page,
  }) => {
    await page.goto('/#/transactions');

    // The canonical fork sibling's transaction is listed...
    await expect(page.getByText(CANONICAL_TX_PREFIX).first()).toBeVisible();
    // ...but the transaction that only exists in the orphaned sibling is not
    await expect(page.getByText(ORPHAN_TX_PREFIX)).toHaveCount(0);

    // Exactly one transaction row at the forked height: the best-chain one
    const forkRows = page.locator('tbody tr').filter({ hasText: '499,998' });
    await expect(forkRows).toHaveCount(1);
  });

  test('orphan-only transaction looked up by hash is not shown as Confirmed', async ({
    page,
  }) => {
    await page.goto(`/#/tx/${ORPHAN_TX_HASH}`);

    // The transaction never landed on the canonical chain: it must not get a
    // Confirmed badge (the old unfiltered scan found it in the orphan block)
    await expect(page.getByText('Transaction Not Found')).toBeVisible();
    await expect(page.getByText('Confirmed', { exact: true })).toHaveCount(0);
  });

  test('canonical fork sibling transaction stays Confirmed', async ({
    page,
  }) => {
    await page.goto(`/#/tx/${CANONICAL_TX_HASH}`);

    // Found in a best-chain block: Confirmed by construction
    await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
    await expect(page.getByText('499,998').first()).toBeVisible();
  });
});
