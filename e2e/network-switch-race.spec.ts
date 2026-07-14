import { test, expect, isMocked, FIXTURE_DATA } from './fixtures';

/**
 * #66 — switching networks while a slow request is in flight must never render
 * the previous network's data.
 *
 * The archive client is a shared singleton whose endpoint is swapped in place,
 * so a slow request dispatched for network A is still outstanding when the user
 * switches to B. If A resolves last it would overwrite B's data — for an
 * explorer, one network's blocks shown under another network's label. The fix
 * is a per-hook request generation guard that discards superseded responses.
 *
 * Here network A (mesa) is deliberately slow and network B (devnet) is instant,
 * with disjoint block heights, so the stale A response lands *after* the switch.
 * Requires the mock harness.
 */
test.describe('network switch race (#66)', () => {
  // Both networks report the SAME max block height so that the stale response's
  // setTotalBlockHeight is a no-op — otherwise usePaginatedBlocks' second effect
  // would refetch on the height change and incidentally mask the race. Only the
  // per-row block heights differ, so the rendered rows unambiguously reveal
  // which network's data is on screen.
  const SHARED_MAX_HEIGHT = 950000;
  function markedBlocks(base: number): unknown {
    const clone = JSON.parse(JSON.stringify(FIXTURE_DATA.blocks));
    const count = clone.data.blocks.length;
    clone.data.blocks = clone.data.blocks.map(
      (b: Record<string, unknown>, i: number) => ({
        ...b,
        blockHeight: base + (count - 1 - i), // descending, like real data
      }),
    );
    clone.data.networkState = {
      maxBlockHeight: {
        canonicalMaxBlockHeight: SHARED_MAX_HEIGHT,
        pendingMaxBlockHeight: SHARED_MAX_HEIGHT,
      },
    };
    return clone;
  }

  test('a slow previous-network response never overwrites the new network', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    const MESA_BASE = 800000; // slow network → heights 800,00x
    const DEVNET_BASE = 900000; // fast network → heights 900,00x
    let mesaBlocksRequested = false;
    let mesaBlocksFulfilled = false;

    // The blocks-list query is named GetBlocksFull/Basic/Minimal/Paginated
    // (all carry per-block userCommands summaries, so match by name, not by
    // field). Excludes GetBlocksByDateRange (staking) and single-block detail.
    const isBlocksList = (postData: string | null): boolean => {
      try {
        const query = JSON.parse(postData || '{}').query || '';
        return query.includes('GetBlocks') && !query.includes('ByDateRange');
      } catch {
        return false;
      }
    };

    // Mesa archive: the blocks list is slow (still pending when we switch away).
    await page.route(
      /\/\/mesa-archive-node-api\.gcp\.o1test\.net/,
      async route => {
        if (!isBlocksList(route.request().postData())) {
          await route.fallback();
          return;
        }
        mesaBlocksRequested = true;
        await new Promise(resolve => setTimeout(resolve, 1500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(markedBlocks(MESA_BASE)),
        });
        mesaBlocksFulfilled = true;
      },
    );

    // Devnet archive: the blocks list answers instantly.
    await page.route(
      /\/\/devnet-archive-node-api\.gcp\.o1test\.net/,
      async route => {
        if (!isBlocksList(route.request().postData())) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(markedBlocks(DEVNET_BASE)),
        });
      },
    );

    // Start on mesa; the blocks request is now in flight (and slow).
    await page.goto('/#/blocks?network=mesa');
    await expect(
      page.locator('header button').filter({ hasText: 'Mesa' }).first(),
    ).toBeVisible({ timeout: 10000 });
    await expect.poll(() => mesaBlocksRequested, { timeout: 10000 }).toBe(true);

    // Switch to devnet before mesa resolves.
    await page
      .locator('header button')
      .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
      .first()
      .click();
    await page.locator('button:has-text("Devnet")').first().click();

    // Devnet data renders (fast response).
    await expect(page.getByText(/900,00\d/).first()).toBeVisible({
      timeout: 10000,
    });

    // Wait until the stale mesa response has actually been delivered to the app
    // (its 1500ms delay elapsed), then give the app a moment to (incorrectly)
    // apply it if the guard were absent...
    await expect.poll(() => mesaBlocksFulfilled, { timeout: 5000 }).toBe(true);
    await page.waitForTimeout(500);

    // ...the guard must have discarded it: mesa heights never appear and the
    // devnet data is still on screen under the devnet label.
    await expect(page.getByText(/800,00\d/)).toHaveCount(0);
    await expect(page.getByText(/900,00\d/).first()).toBeVisible();
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible();
  });
});
