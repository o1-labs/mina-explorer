import { test, expect, isMocked, FIXTURES } from './fixtures';
import { ARCHIVE_URL } from './mock-api';
import type { Page } from '@playwright/test';

/**
 * Query-tier fallbacks (FULL → BASIC → MINIMAL and the like) exist for
 * archives whose schema lacks a field. They must only fall through when the
 * server answered and rejected the query. A rate limit, network failure or
 * timeout fails every tier the same way, so falling through just multiplies
 * requests against an already-limited endpoint (the archive sits behind a
 * Cloudflare rate limit), and a lower tier that slips in once the limit clears
 * renders reduced data as if it were real.
 *
 * Each test answers ONE archive query family with a failure and records which
 * tiers of it were asked. Tiers, not request counts: StrictMode runs every
 * effect twice in dev. The schema-rejection test is the positive control: it
 * proves the recorder sees a fall-through when one is correct.
 */
test.describe('query-tier fallbacks rethrow transport failures', () => {
  const queryName = (postData: string | null): string => {
    try {
      const q: string = JSON.parse(postData || '{}').query || '';
      return q.match(/query\s+(\w+)/)?.[1] ?? '';
    } catch {
      return '';
    }
  };

  // Answer every archive query whose name starts with `prefix` via `respond`
  // and let the rest reach the normal mocks. 'schema' rejects only the top tier
  // (the query named exactly `prefix`). Returns the distinct tiers asked.
  const failArchiveQueries = async (
    page: Page,
    prefix: string,
    respond: 'rate-limit' | 'network' | 'schema',
  ): Promise<Set<string>> => {
    const asked = new Set<string>();
    await page.route(ARCHIVE_URL, async route => {
      const name = queryName(route.request().postData());
      if (!name.startsWith(prefix)) {
        await route.fallback();
        return;
      }
      asked.add(name);
      if (respond === 'network') {
        await route.abort('failed');
      } else if (respond === 'rate-limit') {
        // Cloudflare's own block page: HTML, not GraphQL JSON
        await route.fulfill({
          status: 429,
          contentType: 'text/html',
          body: '<html><body>Rate limited</body></html>',
        });
      } else if (name === prefix) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [
              { message: 'Cannot query field "txFees" on type "Block".' },
            ],
          }),
        });
      } else {
        await route.fallback();
      }
    });
    return asked;
  };

  test.beforeEach(() => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');
  });

  test('analytics shows a rate limit instead of stepping down to reduced queries', async ({
    page,
  }) => {
    const asked = await failArchiveQueries(
      page,
      'BlocksAnalytics',
      'rate-limit',
    );
    await page.goto('/#/analytics');

    await expect(page.getByText('HTTP error: 429')).toBeVisible();
    expect([...asked]).toEqual(['BlocksAnalytics']);
  });

  test('analytics still steps down when the archive rejects the query (control)', async ({
    page,
  }) => {
    const asked = await failArchiveQueries(page, 'BlocksAnalytics', 'schema');
    await page.goto('/#/analytics');

    await expect(page.getByText('Cannot query field')).toHaveCount(0);
    await expect
      .poll(() => [...asked].sort())
      .toEqual(['BlocksAnalytics', 'BlocksAnalyticsBasic']);
  });

  test('a network failure on transaction search is an error, not "not found"', async ({
    page,
  }) => {
    const asked = await failArchiveQueries(
      page,
      'SearchTransaction',
      'network',
    );
    await page.goto(`/#/tx/${FIXTURES.transactions.userCommand}`);

    await expect(page.getByText(/Network error/)).toBeVisible();
    await expect(page.getByText(/Transaction not found/i)).toHaveCount(0);
    expect([...asked]).toEqual(['SearchTransactionBestChain']);
  });
});
