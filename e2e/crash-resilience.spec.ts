import { test, expect, FIXTURES } from './fixtures';
import accountFixture from './fixtures/account.json' with { type: 'json' };

/**
 * Regression tests for #65 — the app must never degrade to a blank page.
 *  1. Blocked browser storage must not abort the bundle at module load.
 *  2. A render-time exception must be caught by an error boundary, keeping
 *     the app shell usable instead of white-screening the whole SPA.
 */
test.describe('Crash resilience (#65)', () => {
  test('boots when browser storage is blocked (no pre-paint white screen)', async ({
    page,
  }) => {
    // Simulate a privacy/enterprise browser (e.g. Safari "Block All Cookies")
    // where every localStorage method throws SecurityError. Before the fix,
    // NetworkContext read localStorage at module-evaluation time, so this
    // threw before React mounted and left a permanent blank page.
    await page.addInitScript(() => {
      const fail = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      const proto = Object.getPrototypeOf(window.localStorage);
      proto.getItem = fail;
      proto.setItem = fail;
      proto.removeItem = fail;
    });

    await page.goto('/');

    // The app must still boot on default-network fallbacks.
    await expect(page).toHaveTitle(/Mina Explorer/);
    await expect(page.locator('header a').first()).toBeVisible();
    await expect(
      page.locator('input[placeholder*="Search"]').first(),
    ).toBeVisible();
  });

  test('a page render error shows a recoverable card, not a blank app', async ({
    page,
  }) => {
    // Return an account whose balance passes the service-layer mapping but is
    // non-numeric, so it only throws while *rendering* (formatMina -> BigInt).
    // Without a boundary this blanks the whole SPA; with one, only the page
    // area shows a fallback and the header stays usable.
    // NOTE: this trigger relies on formatMina throwing on non-numeric input;
    // when #69 makes formatMina input-safe, swap in another render-time throw.
    await page.route('**/*plain*.gcp.o1test.net/graphql', async route => {
      let query = '';
      try {
        query = JSON.parse(route.request().postData() || '{}').query || '';
      } catch {
        query = '';
      }
      // Match the account lookup (requests balance), not bestChain/epoch.
      if (query.includes('account') && query.includes('balance')) {
        const broken = JSON.parse(JSON.stringify(accountFixture));
        broken.data.account.balance.total = 'NOT_A_NUMBER';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(broken),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // The route-level boundary fallback is shown...
    await expect(page.getByText('This page hit an error')).toBeVisible();
    // ...and the app shell (header) survived — proof it is not a full blank.
    await expect(page.locator('header a').first()).toBeVisible();
  });
});
