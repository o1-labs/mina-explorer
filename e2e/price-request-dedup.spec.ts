import { test, expect, isMocked } from './fixtures';

/**
 * #72 — a page with many <Amount> components must not stampede CoinGecko.
 *
 * usePrice used to be a per-instance hook: every <Amount> (and the header
 * PriceDisplay) armed its own 5-minute timer and, on a cold cache, fired its
 * own /simple/price request. The fix makes usePrice read a single app-level
 * PriceProvider (one fetch, one timer) and adds in-flight de-duplication in the
 * price service, so the whole page shares one request.
 *
 * Requires the mock harness (CI or MOCK_API=true) so we can intercept and count
 * the outbound CoinGecko requests deterministically.
 */
test.describe('price request dedup (#72)', () => {
  test('many <Amount> components trigger at most one CoinGecko request', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    // Count current-price requests. Registered after the fixture's mock route
    // so this handler wins (Playwright runs route handlers last-registered
    // first); we fulfill with the payload the app expects.
    let priceRequests = 0;
    await page.route('**/api.coingecko.com/**', async route => {
      if (route.request().url().includes('/simple/price')) {
        priceRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            'mina-protocol': {
              usd: 0.5432,
              eur: 0.4987,
              usd_24h_change: 2.35,
              eur_24h_change: 2.12,
            },
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/#/transactions');

    // Each <Amount> renders a `tabular-nums` span; the confirmed-transactions
    // fixture yields several rows (amount + fee each), so this page mounts many
    // <Amount> instances. Before the fix each one fired its own request.
    const amounts = page.locator('span.tabular-nums');
    await expect(amounts.first()).toBeVisible({ timeout: 20000 });
    await expect
      .poll(() => amounts.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(5);

    // Give any concurrent burst time to land, then assert it was de-duped to a
    // single request (>=1 proves the price is actually fetched; <=1 proves the
    // storm is gone).
    await expect
      .poll(() => priceRequests, { timeout: 5000 })
      .toBeGreaterThanOrEqual(1);
    expect(priceRequests).toBeLessThanOrEqual(1);

    // The price still displays: the header shows the mocked value.
    await expect(page.getByText(/0\.5432/).first()).toBeVisible();
  });
});
