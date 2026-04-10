import { test, expect } from './fixtures';

/**
 * Tests for the `?network=<id>` URL parameter that encodes network selection
 * into shared links (issue #44). The contract under test:
 *
 *   1. URL `?network=` takes precedence over localStorage on initial load.
 *   2. Internal navigation always preserves the param (sync effect re-adds it
 *      after any <Link> click that dropped it).
 *   3. The URL-derived network does NOT overwrite localStorage — localStorage
 *      remains the "default for new sessions".
 *   4. Manual network selection (selector UI) updates BOTH the URL and
 *      localStorage.
 *   5. Invalid `?network=` values fall back gracefully without crashing.
 *   6. A pre-existing custom endpoint still wins over `?network=` and the
 *      stale param is stripped from the URL.
 */

const NETWORK_KEY = 'mina-explorer-network';
const CUSTOM_KEY = 'mina-explorer-custom-endpoint';

function networkParam(url: string): string | null {
  const qIdx = url.indexOf('?');
  if (qIdx < 0) return null;
  return new URLSearchParams(url.slice(qIdx + 1)).get('network');
}

test.describe('URL ?network= parameter', () => {
  test.beforeEach(async ({ page }) => {
    // Start from a clean slate so localStorage from a previous test can't
    // bleed into this one.
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('auto-adds ?network= when missing on first visit', async ({ page }) => {
    // No localStorage, no URL param → falls back to DEFAULT_NETWORK ('mesa')
    // and the sync effect should write it back to the URL.
    await page.goto('/#/blocks');

    await expect
      .poll(() => networkParam(page.url()), { timeout: 5000 })
      .toBe('mesa');
  });

  test('URL ?network= overrides localStorage on initial load', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [NETWORK_KEY, 'mesa'],
    );

    await page.goto('/#/blocks?network=mainnet');

    // Header should reflect Mainnet, not Mesa.
    await expect(
      page.locator('header button').filter({ hasText: 'Mainnet' }).first(),
    ).toBeVisible({ timeout: 10000 });

    // URL still carries the override.
    expect(networkParam(page.url())).toBe('mainnet');
  });

  test('URL-derived network does not overwrite localStorage', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [NETWORK_KEY, 'mesa'],
    );

    await page.goto('/#/blocks?network=mainnet');
    await expect(
      page.locator('header button').filter({ hasText: 'Mainnet' }).first(),
    ).toBeVisible({ timeout: 10000 });

    // localStorage MUST still hold the user's saved preference.
    const stored = await page.evaluate(
      key => localStorage.getItem(key),
      NETWORK_KEY,
    );
    expect(stored).toBe('mesa');
  });

  test('network selector updates both URL param and localStorage', async ({
    page,
  }) => {
    await page.goto('/#/blocks?network=mesa');
    await expect(
      page.locator('header button').filter({ hasText: 'Mesa' }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Open the selector and pick Devnet.
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
      .first();
    await networkButton.click();
    await page.locator('button:has-text("Devnet")').first().click();

    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible({ timeout: 10000 });

    // URL should be rewritten to ?network=devnet.
    await expect
      .poll(() => networkParam(page.url()), { timeout: 5000 })
      .toBe('devnet');

    // localStorage should also persist the explicit choice.
    const stored = await page.evaluate(
      key => localStorage.getItem(key),
      NETWORK_KEY,
    );
    expect(stored).toBe('devnet');
  });

  test('?network= survives internal navigation via <Link>', async ({
    page,
  }) => {
    // This is the regression test for the original bug: clicking any link
    // inside the app must not drop the network param. The fix relies on a
    // single sync effect re-adding it after navigation, so no <Link> call
    // site needs to know about it.
    await page.goto('/#/blocks?network=mainnet');
    await expect(
      page.locator('header button').filter({ hasText: 'Mainnet' }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Click the first row's link (block height or hash).
    const tableRows = page.locator('tbody tr');
    await expect(tableRows.first()).toBeVisible({ timeout: 15000 });
    await tableRows.first().locator('a').first().click();

    // We should land on a /block/... route and the param must still be there.
    await expect
      .poll(() => page.url(), { timeout: 5000 })
      .toMatch(/#\/block\/[^?]+\?.*network=mainnet/);
  });

  test('invalid ?network= value falls back gracefully', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [NETWORK_KEY, 'devnet'],
    );

    await page.goto('/#/blocks?network=not-a-real-network');

    // Header should fall back to the localStorage value, not crash.
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Sync effect should rewrite the URL to a valid id.
    await expect
      .poll(() => networkParam(page.url()), { timeout: 5000 })
      .toBe('devnet');
  });

  test('custom endpoint wins over ?network= and strips the param', async ({
    page,
  }) => {
    // Pre-seed a custom endpoint, then visit a shared link with ?network=.
    // The custom endpoint should remain active and the stale param should
    // be removed from the URL.
    await page.goto('/');
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [CUSTOM_KEY, 'http://localhost:9999/graphql'],
    );

    await page.goto('/#/blocks?network=mainnet');

    // Header should reflect "Custom", not Mainnet.
    await expect(
      page.locator('header button').filter({ hasText: 'Custom' }).first(),
    ).toBeVisible({ timeout: 10000 });

    // URL ?network= should be stripped by the sync effect.
    await expect
      .poll(() => networkParam(page.url()), { timeout: 5000 })
      .toBeNull();
  });
});
