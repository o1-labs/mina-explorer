import { test, expect, isMocked, FIXTURES } from './fixtures';
import { ARCHIVE_URL } from './mock-api';
import type { Page } from '@playwright/test';

/**
 * Query-tier fallbacks (FULL → BASIC → MINIMAL and the like) exist for
 * archives whose schema lacks a field. They must only fall through when the
 * server validated the query and rejected its shape. A rate limit, a server
 * error or a network failure is not about the shape, so falling through just
 * multiplies requests against a struggling endpoint (the archive sits behind a
 * Cloudflare rate limit), and a lower tier that slips in once it recovers
 * renders reduced data, or "not found", as if it were the answer.
 *
 * Each test answers ONE archive query family with a failure and records which
 * tiers of it were asked. Tiers, not request counts: StrictMode runs every
 * effect twice in dev. The schema-rejection test is the positive control: it
 * proves the recorder sees a fall-through when one is correct.
 */
test.describe('query-tier fallbacks rethrow non-schema failures', () => {
  const queryName = (postData: string | null): string => {
    try {
      const q: string = JSON.parse(postData || '{}').query || '';
      return q.match(/query\s+(\w+)/)?.[1] ?? '';
    } catch {
      return '';
    }
  };

  const errorBody = (message: string, code?: string): string =>
    JSON.stringify({
      errors: [{ message, ...(code ? { extensions: { code } } : {}) }],
    });

  type Failure =
    // Archive-Node-API's own rate limiter, or any 429 the browser can read:
    // a JSON `errors` body that must NOT count as a schema rejection
    | 'rate-limit-json'
    // Cloudflare's rate-limit block carries no CORS headers, so the browser
    // sees it as a failed fetch, the same as a dropped connection
    | 'network'
    // yoga's masked resolver/database failure
    | 'server-error'
    // the top tier asks for a field this archive lacks
    | 'schema'
    // the top tier is rejected as above, then a lower tier's fetch fails
    | 'schema-then-network';

  // Answer every archive query whose name starts with `prefix` with `failure`
  // and let the rest reach the normal mocks. The 'schema' modes reject only the
  // top tier (the query named exactly `prefix`). Returns the distinct tiers
  // asked.
  const failArchiveQueries = async (
    page: Page,
    prefix: string,
    failure: Failure,
  ): Promise<Set<string>> => {
    const asked = new Set<string>();
    await page.route(ARCHIVE_URL, async route => {
      const name = queryName(route.request().postData());
      if (!name.startsWith(prefix)) {
        await route.fallback();
        return;
      }
      asked.add(name);
      if (failure === 'network') {
        await route.abort('failed');
      } else if (failure === 'rate-limit-json') {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: errorBody(
            'Too many requests. Please retry later.',
            'RATE_LIMITED',
          ),
        });
      } else if (failure === 'server-error') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: errorBody('Unexpected error.'),
        });
      } else if (failure === 'schema-then-network' && name !== prefix) {
        await route.abort('failed');
      } else if (name === prefix) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: errorBody(
            'Cannot query field "txFees" on type "Block".',
            'GRAPHQL_VALIDATION_FAILED',
          ),
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
      'rate-limit-json',
    );
    await page.goto('/#/analytics');

    await expect(page.getByText(/Too many requests/)).toBeVisible();
    expect([...asked]).toEqual(['BlocksAnalytics']);
  });

  test('analytics still steps down one tier when the archive rejects the query (control)', async ({
    page,
  }) => {
    const asked = await failArchiveQueries(page, 'BlocksAnalytics', 'schema');
    await page.goto('/#/analytics');

    // Data from the BASIC tier rendered; only then is "no error" meaningful
    await expect(page.getByText(/^Block Production/)).toBeVisible();
    await expect(page.getByText(/Cannot query field/)).toHaveCount(0);
    expect([...asked].sort()).toEqual([
      'BlocksAnalytics',
      'BlocksAnalyticsBasic',
    ]);
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

  test('a server error on transaction search is an error, not "not found"', async ({
    page,
  }) => {
    const asked = await failArchiveQueries(
      page,
      'SearchTransaction',
      'server-error',
    );
    await page.goto(`/#/tx/${FIXTURES.transactions.userCommand}`);

    await expect(page.getByText(/Unexpected error/)).toBeVisible();
    await expect(page.getByText(/Transaction not found/i)).toHaveCount(0);
    expect([...asked]).toEqual(['SearchTransactionBestChain']);
  });

  test('a rate limit on block detail is an error, not "Block not found"', async ({
    page,
  }) => {
    const asked = await failArchiveQueries(
      page,
      'GetBlockByHeight',
      'rate-limit-json',
    );
    await page.goto(`/#/block/${FIXTURES.blocks.knownHeight}`);

    await expect(page.getByText(/Too many requests/)).toBeVisible();
    await expect(page.getByText(/Block not found/i)).toHaveCount(0);
    expect([...asked]).toEqual(['GetBlockByHeightBestChain']);
  });

  test('a network failure on the zkApps flat tier is an error, not "not available"', async ({
    page,
  }) => {
    // The live archive is flat-schema, so the nested tier is always rejected
    // and the flat tier is the one that meets the rate limit.
    const asked = await failArchiveQueries(
      page,
      'GetZkAppActivity',
      'schema-then-network',
    );
    await page.goto('/#/zkapps');

    await expect(page.getByText(/Network error/)).toBeVisible();
    await expect(page.getByText(/not available/)).toHaveCount(0);
    expect([...asked].sort()).toEqual([
      'GetZkAppActivity',
      'GetZkAppActivityFlat',
    ]);
  });
});
