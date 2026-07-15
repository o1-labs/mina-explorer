import { test, expect, isMocked } from './fixtures';

/**
 * #90 — on an archive WITHOUT the transaction-details extension, the
 * Transactions page falls back to the daemon (a ~30 recent-block window) but
 * used to compute the page count from the REAL chain height: with height
 * 400,000 and 50 blocks per page the UI claimed "Page 1 of 8,000", and every
 * one of those pages re-failed the archive query and re-showed the same ~30
 * daemon blocks.
 *
 * The fix makes the fallback result carry the actually-pageable block count
 * (the daemon window) separately from the chain height, so pagination
 * collapses to a single honest page, and adds a disclosure banner naming the
 * recent-block window.
 *
 * This simulates that archive: every confirmed-transactions query (which
 * selects userCommands) errors as if the schema lacks those fields; the
 * daemon bestChain query supplies the fallback window. Requires the mock
 * harness.
 */
test.describe('transactions daemon fallback pagination (#90)', () => {
  const CHAIN_HEIGHT = 400000;
  const B62 = 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg';

  const getQuery = (postData: string | null): string => {
    try {
      return JSON.parse(postData || '{}').query || '';
    } catch {
      return '';
    }
  };

  test('shows a single honest page and a disclosure, not thousands of fabricated pages', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    // Archive: the confirmed-transactions queries (GetTransactions /
    // GetTransactionsPaginated, both selecting userCommands) error as if the
    // tx-detail extension is absent. Everything else falls through to the
    // standard mocks.
    await page.route(/archive-node-api/, async route => {
      const q = getQuery(route.request().postData());
      if (!q.includes('GetTransactions')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [
            { message: 'Cannot query field "userCommands" on type "Block".' },
          ],
        }),
      });
    });

    // Daemon: bestChain serves the small fallback window near the REAL chain
    // height (400,000). On main this height leaked into the page math as
    // "Page 1 of 8,000".
    await page.route(/graphql/, async route => {
      const q = getQuery(route.request().postData());
      if (!q.includes('bestChain(maxLength')) {
        await route.fallback();
        return;
      }
      // bestChain returns oldest-first
      const bestChain = [CHAIN_HEIGHT - 2, CHAIN_HEIGHT - 1, CHAIN_HEIGHT].map(
        (height, i) => ({
          stateHash: `3NKDaemonFallback${height}00000000000000000000000000000`,
          protocolState: {
            consensusState: { blockHeight: String(height) },
            blockchainState: { date: String(1767225600000 + i * 180000) },
          },
          transactions: {
            userCommands: [
              {
                hash: `CkpDaemonFallbackTx${height}0000000000000000000000000`,
                kind: 'PAYMENT',
                from: B62,
                to: B62,
                amount: '1000000000',
                fee: '100000000',
                memo: '',
                nonce: i,
                failureReason: null,
              },
            ],
            zkappCommands: [],
          },
        }),
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { bestChain } }),
      });
    });

    await page.goto('/#/transactions');

    // The fallback data rendered: the daemon window's blocks are listed.
    await expect(
      page.getByRole('link', { name: '400,000' }).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('link', { name: '399,998' })).toBeVisible();

    // The real chain height is still displayed in the header — it just must
    // not drive the page count.
    await expect(
      page.getByText('400,000 total blocks', { exact: false }),
    ).toBeVisible();

    // The disclosure names the daemon's recent-block window (MAX_DAEMON_BLOCKS).
    await expect(page.getByText(/30 most recent blocks only/)).toBeVisible();

    // No fabricated pagination: the daemon window fits on one page, so the
    // pagination bar must not render at all — in particular no
    // "Page 1 of 8,000" derived from chain height / blocks-per-page.
    await expect(page.getByText(/Page \d+ of/)).toHaveCount(0);
    await expect(page.getByText(/of 8,000/)).toHaveCount(0);
    await expect(page.getByTitle('Next page')).toHaveCount(0);
  });
});
