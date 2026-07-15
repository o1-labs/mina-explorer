import { test, expect, isMocked } from './fixtures';

/**
 * Regression tests for #88 — daemon queries must target the network the UI
 * displays, even for a session-scoped network adopted from a shared link's
 * `?network=` param.
 *
 * The bug: `getDaemonEndpoint()` re-resolved the network at call time
 * (URL hash → localStorage → default). A network adopted from `?network=` is
 * deliberately NOT written to localStorage, and internal <Link> navigation
 * momentarily drops the param from the URL. Page data effects run before the
 * parent NetworkProvider effect re-adds the param, so daemon calls made in
 * that window resolved from localStorage/default — a different network than
 * the one on screen. The archive client never had the bug because its
 * endpoint is a singleton set from context state; the fix mirrors that
 * pattern for the daemon.
 *
 * Scenario under test: localStorage says mainnet, the user opens a shared
 * devnet link, then clicks an internal nav link to a page that issues daemon
 * queries on mount (mempool + epoch info). Every daemon request must hit the
 * devnet daemon; the wrong networks' daemons must see ZERO requests.
 */

const NETWORK_KEY = 'mina-explorer-network';

// Every preset daemon URL contains "plain" and ends in "/graphql" (see
// src/config/networks.ts). Matching broadly means a leak to ANY wrong
// network's daemon is caught, not just mainnet's.
const ANY_DAEMON = /plain.*\/graphql/;
const DEVNET_DAEMON = /devnet-plain-1\.gcp\.o1test\.net\/graphql/;

test.describe('daemon endpoint follows displayed network (#88)', () => {
  test.beforeEach(() => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');
  });

  test('internal navigation after arriving via ?network= keeps daemon queries on the displayed network', async ({
    page,
  }) => {
    // localStorage holds a DIFFERENT network than the shared link. On main,
    // call-time resolution falls back to this value in the navigation window
    // where the URL has no ?network= param.
    await page.addInitScript(
      ([key, value]: string[]) => {
        window.localStorage.setItem(key, value);
      },
      [NETWORK_KEY, 'mainnet'],
    );

    const devnetQueries: string[] = [];
    const wrongDaemonUrls: string[] = [];

    await page.route(ANY_DAEMON, async route => {
      const url = route.request().url();
      let query = '';
      try {
        query = JSON.parse(route.request().postData() || '{}').query || '';
      } catch {
        query = '';
      }

      if (DEVNET_DAEMON.test(url)) {
        devnetQueries.push(query);
        // Fall through to the fixture mock so daemon-sourced data renders.
        await route.fallback();
        return;
      }

      // A request to any other network's daemon IS the bug. Record it (the
      // assertions below fail the test) and fulfill with empty data so the
      // request neither hangs nor escapes to a real endpoint.
      wrongDaemonUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    });

    // Arrive via the shared devnet link.
    await page.goto('/#/blocks?network=devnet');
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Navigate internally — the <Link> drops ?network=, and the destination
    // page fires daemon queries (mempool user/zkApp commands) on mount,
    // before the provider effect re-adds the param.
    await page.getByRole('link', { name: 'Transactions' }).first().click();
    await expect
      .poll(() => page.url(), { timeout: 5000 })
      .toContain('/transactions');

    // The mempool queries fired after navigation must have gone to devnet.
    await expect
      .poll(() => devnetQueries.some(q => q.includes('pooledUserCommands')), {
        timeout: 10000,
      })
      .toBe(true);
    await expect
      .poll(() => devnetQueries.some(q => q.includes('pooledZkappCommands')), {
        timeout: 10000,
      })
      .toBe(true);

    // Daemon-sourced data renders under the Devnet label: the mempool tab
    // shows the fixture's counts (2 pooled user commands, 1 zkApp command).
    await page.getByRole('button', { name: 'Mempool', exact: true }).click();
    await expect(page.getByText('User Transactions (2)')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('zkApp Commands (1)')).toBeVisible();
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible();

    // And NOTHING leaked to any other network's daemon — not during the
    // initial load, not in the navigation window, not after.
    expect(wrongDaemonUrls).toEqual([]);
  });

  test('daemon queries on initial load of a shared link ignore localStorage', async ({
    page,
  }) => {
    // Same seed, but land directly on a page that queries the daemon on
    // mount. Guards the module-load initialization path (before the provider
    // is mounted).
    await page.addInitScript(
      ([key, value]: string[]) => {
        window.localStorage.setItem(key, value);
      },
      [NETWORK_KEY, 'mainnet'],
    );

    const wrongDaemonUrls: string[] = [];
    let devnetHit = false;

    await page.route(ANY_DAEMON, async route => {
      const url = route.request().url();
      if (DEVNET_DAEMON.test(url)) {
        devnetHit = true;
        await route.fallback();
        return;
      }
      wrongDaemonUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    });

    await page.goto('/#/transactions?network=devnet');
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible({ timeout: 10000 });

    await expect.poll(() => devnetHit, { timeout: 10000 }).toBe(true);
    expect(wrongDaemonUrls).toEqual([]);
  });
});
