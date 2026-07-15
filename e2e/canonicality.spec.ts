/**
 * Regression tests for issue #86: block canonicality must come from the
 * archive's chain status (via the inBestChain filter), never from
 * `height <= canonicalMaxBlockHeight` alone.
 *
 * The fixture models a short-range fork: two blocks at height 499998, one on
 * the best chain and one orphaned, with the orphan deliberately listed FIRST
 * so any `blocks[0]` fork-choice bug surfaces. The mock emulates the
 * Archive-Node-API server semantics verified against the live endpoints:
 * `inBestChain: true` excludes orphaned fork blocks.
 *
 * This spec sets up its own route mocks (independent of MOCK_API) so it runs
 * deterministically in any environment.
 */

import { test, expect, type Route } from '@playwright/test';
import forkFixture from './fixtures/blocks-fork.json' with { type: 'json' };

const FORK_HEIGHT = 499998;
const CANONICAL_HASH = '3NLcanonicalForkBlockXq7RJTujV3ZfyPHZBGrWFUqYuBZXCDQ';
const ORPHAN_HASH = '3NLorphanedForkBlockXq7RJTujV3ZfyPHZBGrWFUqYuBZXCDQV';
// First-8-char prefixes are unique, so they match both full and truncated
// renderings of each transaction hash.
const ORPHAN_TX_PREFIX = /CkpOrpha/;
const DAEMON_TX_PREFIX = /CkpDaemo/;

const { networkState, blocks: allBlocks, daemonBlock } = forkFixture;

async function fulfillJson(route: Route, payload: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

/**
 * Emulate the archive: return all blocks (including the orphaned fork) unless
 * the query filters with `inBestChain: true`.
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
  const bestChainOnly = query.includes('inBestChain');

  // Hash search scan: heights + hashes of recent blocks, orphans included
  if (query.includes('SearchBlockByHash')) {
    await fulfillJson(route, { data: { blocks: allBlocks } });
    return;
  }

  // Block detail at a height range
  if (vars.blockHeightGte !== undefined) {
    let blocks = allBlocks.filter(
      b =>
        b.blockHeight >= vars.blockHeightGte &&
        b.blockHeight < vars.blockHeightLt,
    );
    if (bestChainOnly) {
      blocks = blocks.filter(b => !b.orphaned);
    }
    await fulfillJson(route, { data: { blocks, networkState } });
    return;
  }

  // Block list queries
  if (query.includes('blocks(')) {
    let blocks = allBlocks;
    if (vars.maxBlockHeight !== undefined) {
      blocks = blocks.filter(b => b.blockHeight < vars.maxBlockHeight);
    }
    if (bestChainOnly) {
      blocks = blocks.filter(b => !b.orphaned);
    }
    await fulfillJson(route, { data: { blocks, networkState } });
    return;
  }

  if (query.includes('networkState')) {
    await fulfillJson(route, { data: { networkState } });
    return;
  }

  await route.fulfill({ status: 500, body: '' });
}

/**
 * Emulate the daemon: it only knows the best chain, so `block(height:)` at
 * the fork height returns the CANONICAL sibling (with a marker transaction
 * that must never leak onto the orphaned block's page).
 */
async function handleDaemonRequest(route: Route): Promise<void> {
  const postData = route.request().postData();
  const query: string = postData ? JSON.parse(postData).query || '' : '';

  if (query.includes('block(height')) {
    await fulfillJson(route, { data: { block: daemonBlock } });
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

test.describe('Block canonicality on forks (issue #86)', () => {
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

  test('blocks list shows a single canonical entry at a forked height', async ({
    page,
  }) => {
    await page.goto('/#/blocks');

    // Exactly one row at the fork height: the best-chain block, not the
    // orphaned sibling (which the old height heuristic also badged Canonical)
    const forkRows = page.locator('tr').filter({ hasText: '499,998' });
    await expect(forkRows).toHaveCount(1);
    await expect(forkRows.first()).toContainText('3NLcanon');
    await expect(forkRows.first()).not.toContainText('3NLorpha');
    await expect(forkRows.first()).not.toContainText('Pending');
  });

  test('block detail by height shows the best-chain block, not an arbitrary fork sibling', async ({
    page,
  }) => {
    await page.goto(`/#/block/${FORK_HEIGHT}`);

    // The orphan is listed first in the archive response; the explorer must
    // still display the best-chain block at this height
    await expect(page.locator('span.break-all').first()).toHaveText(
      CANONICAL_HASH,
    );
    await expect(page.getByText('Canonical', { exact: true })).toBeVisible();
  });

  test('orphaned block viewed by hash is labeled Orphaned and keeps its own transactions', async ({
    page,
  }) => {
    await page.goto(`/#/block/${ORPHAN_HASH}`);

    // The displayed block matches the searched hash (no sibling swap)
    await expect(page.locator('span.break-all').first()).toHaveText(
      ORPHAN_HASH,
    );
    // Labeled Orphaned, not Canonical (old code: height <= canonicalMax)
    await expect(page.getByText('Orphaned', { exact: true })).toBeVisible();
    await expect(page.getByText('Canonical', { exact: true })).toHaveCount(0);
    // Its own transactions are shown; the daemon's best-chain sibling
    // transactions are NOT merged in (stateHash mismatch)
    await expect(page.getByText(ORPHAN_TX_PREFIX).first()).toBeVisible();
    await expect(page.getByText(DAEMON_TX_PREFIX)).toHaveCount(0);
  });

  test('canonical block viewed by hash matches the searched hash and allows daemon enrichment', async ({
    page,
  }) => {
    await page.goto(`/#/block/${CANONICAL_HASH}`);

    await expect(page.locator('span.break-all').first()).toHaveText(
      CANONICAL_HASH,
    );
    await expect(page.getByText('Canonical', { exact: true })).toBeVisible();
    // Daemon enrichment still applies when the state hashes match
    await expect(page.getByText(DAEMON_TX_PREFIX).first()).toBeVisible();
  });
});
