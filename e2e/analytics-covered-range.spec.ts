import { test, expect, isMocked } from './fixtures';

/**
 * #87 — the analytics page silently capped every query at 2,000 blocks while
 * dividing transaction totals by the FULL selected period. On mainnet, 2,000
 * blocks cover only ~4-7 days, so "Last 30 days" showed totals/TPS computed
 * from a fraction of the period but labeled as 30 days (under-reported ~4-7x).
 *
 * The fix computes stats over the range the fetched blocks actually cover and
 * discloses the covered range in the UI whenever it is shorter than the
 * selected period.
 *
 * This spec serves exactly ANALYTICS_BLOCK_LIMIT (2,000) blocks spanning ~5
 * days and selects "Last 30 days". The expected TPS is only correct if the
 * denominator is the covered span (~5 days): a 30-day denominator yields a
 * 6x smaller value that rounds to a different 4-decimal display.
 */

const BLOCK_LIMIT = 2000; // must match ANALYTICS_BLOCK_LIMIT in analytics.ts
const TXS_PER_BLOCK = 2;
const STEP_SECONDS = 216; // 1,999 gaps * 216s = 431,784s ≈ 5.0 days of chain

const getQuery = (postData: string | null): string => {
  try {
    return JSON.parse(postData || '{}').query || '';
  } catch {
    return '';
  }
};

test.describe('analytics covered range (#87)', () => {
  test('TPS and labels use the covered range, not the selected period', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    // Deterministic fixture: exactly the block cap, evenly spaced, newest now.
    const base = Date.now();
    const blocks = Array.from({ length: BLOCK_LIMIT }, (_, i) => ({
      blockHeight: 500000 - i,
      dateTime: new Date(base - i * STEP_SECONDS * 1000).toISOString(),
      txFees: '100000000',
      transactions: {
        userCommands: Array.from({ length: TXS_PER_BLOCK }, (_, j) => ({
          hash: `CkpCoveredRange${i}x${j}`,
        })),
        zkappCommands: [],
      },
    }));

    await page.route(/archive-node-api/, async route => {
      const q = getQuery(route.request().postData());
      if (!q.includes('BlocksAnalytics')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { blocks } }),
      });
    });

    await page.goto('/#/analytics');
    await expect(page.getByTestId('stat-total-blocks')).toBeVisible({
      timeout: 30000,
    });

    await page.locator('button').filter({ hasText: 'Last 30 days' }).click();

    // Expected values derived from the fixture itself.
    const spanSeconds = (BLOCK_LIMIT - 1) * STEP_SECONDS; // 431,784s
    const totalTx = BLOCK_LIMIT * TXS_PER_BLOCK; // 4,000
    const coveredTps = (totalTx / spanSeconds).toFixed(4); // '0.0093'
    const fullPeriodTps = (totalTx / (30 * 86400)).toFixed(4); // '0.0015'
    const coveredLabel = `${(spanSeconds / 86400).toFixed(1)} days`; // '5.0 days'

    // Sanity: the assertion below is discriminating between denominators.
    expect(coveredTps).not.toBe(fullPeriodTps);

    // (1) TPS denominator is the covered span, not the selected 30 days.
    const tpsCard = page.getByTestId('stat-tps');
    await expect(tpsCard).toContainText(coveredTps, { timeout: 30000 });
    await expect(tpsCard).not.toContainText(fullPeriodTps);
    await expect(tpsCard).toContainText(`over last ${coveredLabel}`);

    // (2) The UI discloses the actual covered range everywhere.
    const notice = page.getByTestId('analytics-coverage-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(coveredLabel);
    await expect(notice).toContainText('30 days');

    await expect(page.getByTestId('stat-total-blocks')).toContainText(
      `In last ${coveredLabel}`,
    );
    await expect(
      page.getByText(`Block Production (last ${coveredLabel})`),
    ).toBeVisible();
    await expect(
      page.getByText(`Transaction Volume (last ${coveredLabel})`),
    ).toBeVisible();
    await expect(
      page.getByText(`Daily Summary (last ${coveredLabel})`),
    ).toBeVisible();

    // (3) The partial oldest day is dropped from the daily buckets so it
    // cannot render as a plausible full-day bar.
    const distinctDays = new Set(blocks.map(b => b.dateTime.split('T')[0]));
    await expect(page.locator('table tbody tr')).toHaveCount(
      distinctDays.size - 1,
    );
  });

  test('no truncation notice when the blocks cover the full period', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    // Default mock serves ~140 blocks over 7 days — far below the block cap,
    // so the fetched blocks cover the whole selected period.
    await page.goto('/#/analytics');
    await expect(page.getByTestId('stat-total-blocks')).toBeVisible({
      timeout: 30000,
    });

    // Labels stay exactly as before the fix.
    await expect(page.getByTestId('stat-total-blocks')).toContainText(
      'In 7 days',
    );
    await expect(page.getByTestId('stat-tps')).toContainText(
      'Transactions per second',
    );
    await expect(page.getByTestId('analytics-coverage-notice')).toHaveCount(0);
    await expect(
      page.getByText('Block Production', { exact: true }),
    ).toBeVisible();
  });
});
