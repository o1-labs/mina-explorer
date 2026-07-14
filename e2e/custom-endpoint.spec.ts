import { test, expect, FIXTURES, isMocked } from './fixtures';
import accountFixture from './fixtures/account.json' with { type: 'json' };

/**
 * Regression tests for #71 — when a custom endpoint is configured, the daemon
 * path (account/mempool reads AND transaction broadcast) must hit that
 * endpoint, not the previously selected public network's daemon.
 */
// https so the app's CSP (connect-src https: http://localhost:*) permits it —
// a realistic remote custom endpoint. The bug is about routing, not the scheme.
const CUSTOM_URL = 'https://custom-daemon.test/graphql';

// Every preset daemon URL contains "plain" and ends in "/graphql" (mesa,
// pre-mesa, devnet, mainnet, mesa-mut, ...). A hit here means a daemon call
// leaked to a preset network — the bug this fixes. Kept broad on purpose so it
// catches every preset host, not just the current default network.
const PRESET_DAEMON = /plain.*graphql/;

async function activateCustomEndpoint(
  page: import('@playwright/test').Page,
): Promise<{ customQueries: string[]; presetHit: () => boolean }> {
  await page.addInitScript((url: string) => {
    window.localStorage.setItem('mina-explorer-custom-endpoint', url);
  }, CUSTOM_URL);

  const customQueries: string[] = [];
  await page.route(/custom-daemon\.test/, async route => {
    let query = '';
    try {
      query = JSON.parse(route.request().postData() || '{}').query || '';
    } catch {
      query = '';
    }
    customQueries.push(query);

    let body: unknown = {
      data: { blocks: [], bestChain: [], account: null },
    };
    if (query.includes('account') && query.includes('balance')) {
      body = accountFixture;
    } else if (query.includes('sendPayment')) {
      body = {
        data: { sendPayment: { payment: { hash: 'CkpCustomEndpointOk' } } },
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  let hit = false;
  await page.route(PRESET_DAEMON, async route => {
    hit = true;
    await route.fallback();
  });

  return { customQueries, presetHit: () => hit };
}

test.describe('Custom endpoint routing (#71)', () => {
  test.beforeEach(() => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');
  });

  test('account reads go to the custom endpoint, not the preset daemon', async ({
    page,
  }) => {
    const { customQueries, presetHit } = await activateCustomEndpoint(page);

    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // Balance rendered => the account query resolved from the custom endpoint.
    await expect(page.getByText(/150,000/).first()).toBeVisible({
      timeout: 20000,
    });
    // The daemon account query was sent to the custom endpoint...
    expect(
      customQueries.some(q => q.includes('account') && q.includes('balance')),
    ).toBe(true);
    // ...and nothing leaked to a preset network's daemon.
    expect(presetHit()).toBe(false);
  });

  test('broadcast posts to the custom endpoint, not the preset daemon', async ({
    page,
  }) => {
    const { customQueries, presetHit } = await activateCustomEndpoint(page);

    await page.goto('/#/broadcast');

    const payload = {
      input: {
        from: FIXTURES.accounts.blockProducer,
        to: FIXTURES.accounts.knownAccount,
        amount: '1000000000',
        fee: '10000000',
        nonce: '0',
      },
      signature: { field: '1', scalar: '2' },
    };
    await page.locator('#tx-json').fill(JSON.stringify(payload));
    await page.getByRole('button', { name: 'Broadcast Transaction' }).click();

    // Success => the mutation resolved from the custom endpoint.
    await expect(
      page.getByText('Transaction broadcast successfully!'),
    ).toBeVisible({ timeout: 20000 });
    expect(customQueries.some(q => q.includes('sendPayment'))).toBe(true);
    expect(presetHit()).toBe(false);
  });
});
