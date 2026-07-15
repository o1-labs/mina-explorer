import { test, expect, isMocked } from './fixtures';

/**
 * #73 — the archive can't look blocks up by hash (its query has no stateHash
 * filter), so a hash search only scans the most recent ~5,000 blocks. When a
 * well-formed state hash isn't found there, the page must explain the recent-
 * window limitation and point at height-based lookup — not just say "Block not
 * found" as if the block doesn't exist. Requires the mock harness.
 */
test.describe('block hash not-found UX (#73)', () => {
  test('a valid hash outside the recent window explains the limitation', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    // Valid state-hash format (3N…, length ≥ 50) that is in no fixture, so the
    // recent-window scan completes without a match.
    const unknownHash = '3N' + 'a'.repeat(50);
    await page.goto(`/#/block/${unknownHash}`);

    // The honest window-limitation panel, not a bare "Block not found".
    await expect(page.getByText(/found in the most recent/i)).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/search by height instead/i)).toBeVisible();
    // It names the actual search window (5,000 blocks).
    await expect(page.getByText(/5,000/).first()).toBeVisible();
  });
});
