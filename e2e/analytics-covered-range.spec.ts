import { test, expect, isMocked } from './fixtures';

/**
 * #87 — the analytics page silently capped every query at 2,000 blocks while
 * dividing transaction totals by the FULL selected period. On mainnet, 2,000
 * blocks cover only ~4-7 days, so "Last 30 days" showed totals/TPS computed
 * from a fraction of the period but labeled as 30 days (under-reported ~4-7x).
 *
 * The fix computes stats over ONE coherent block set: when the cap truncates
 * the period, the partial oldest day is dropped from the daily buckets AND
 * from the totals/TPS/covered range, and the UI discloses the covered range.
 *
 * This spec serves exactly ANALYTICS_BLOCK_LIMIT (2,000) blocks anchored to
 * UTC day boundaries (newest block 1s before today's UTC midnight) so the
 * daily bucketing is deterministic: 5 UTC days, the oldest partial. Blocks on
 * the partial day carry 12 user commands each while full days carry 2, so the
 * expected TPS is only correct if BOTH the numerator and the denominator come
 * from the post-drop block set:
 *   - correct:            3,200 tx / 345,384 s          -> 0.0093
 *   - partial-day leak:   8,000 tx / 431,784 s          -> 0.0185
 *   - full-period (bug):  8,000 tx / 2,592,000 s (30d)  -> 0.0031
 */

const BLOCK_LIMIT = 2000; // must match ANALYTICS_BLOCK_LIMIT in analytics.ts
const STEP_SECONDS = 216; // 1,999 gaps * 216s = 431,784s ≈ 5.0 days of chain
const FULL_DAY_TXS = 2;
const PARTIAL_DAY_TXS = 12;

const getQuery = (postData: string | null): string => {
  try {
    return JSON.parse(postData || '{}').query || '';
  } catch {
    return '';
  }
};

/** 2,000 blocks ending 1s before today's UTC midnight, one every 216s. */
const buildFixtureBlocks = (): {
  blockHeight: number;
  dateTime: string;
  txFees: string;
  txCount: number;
}[] => {
  const now = new Date();
  const base =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 1000;
  const times = Array.from(
    { length: BLOCK_LIMIT },
    (_, i) => base - i * STEP_SECONDS * 1000,
  );
  const oldestDate = new Date(times[times.length - 1])
    .toISOString()
    .split('T')[0];
  return times.map((t, i) => {
    const dateTime = new Date(t).toISOString();
    const partial = dateTime.split('T')[0] === oldestDate;
    return {
      blockHeight: 500000 - i,
      dateTime,
      txFees: '100000000',
      txCount: partial ? PARTIAL_DAY_TXS : FULL_DAY_TXS,
    };
  });
};

test.describe('analytics covered range (#87)', () => {
  test('TPS and labels use the covered range, not the selected period', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    const fixtureBlocks = buildFixtureBlocks();
    const responseBlocks = fixtureBlocks.map(b => ({
      blockHeight: b.blockHeight,
      dateTime: b.dateTime,
      txFees: b.txFees,
      transactions: {
        userCommands: Array.from({ length: b.txCount }, (_, j) => ({
          hash: `CkpCoveredRange${b.blockHeight}x${j}`,
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
        body: JSON.stringify({ data: { blocks: responseBlocks } }),
      });
    });

    await page.goto('/#/analytics');
    await expect(page.getByTestId('stat-total-blocks')).toBeVisible({
      timeout: 30000,
    });

    await page.locator('button').filter({ hasText: 'Last 30 days' }).click();

    // Expected values derived from the fixture itself, applying the fix's
    // convention: the partial oldest UTC day is excluded everywhere.
    const partialDate =
      fixtureBlocks[fixtureBlocks.length - 1].dateTime.split('T')[0];
    const counted = fixtureBlocks.filter(
      b => b.dateTime.split('T')[0] !== partialDate,
    );
    const countedTimes = counted.map(b => Date.parse(b.dateTime));
    const spanSeconds =
      (Math.max(...countedTimes) - Math.min(...countedTimes)) / 1000;
    const countedTx = counted.reduce((sum, b) => sum + b.txCount, 0);
    const allTx = fixtureBlocks.reduce((sum, b) => sum + b.txCount, 0);
    const rawSpanSeconds = (BLOCK_LIMIT - 1) * STEP_SECONDS;

    const coveredTps = (countedTx / spanSeconds).toFixed(4); // '0.0093'
    const leakedTps = (allTx / rawSpanSeconds).toFixed(4); // '0.0185'
    const fullPeriodTps = (allTx / (30 * 86400)).toFixed(4); // '0.0031'
    const coveredLabel = `${(spanSeconds / 86400).toFixed(1)} days`; // '4.0 days'

    // Sanity: the assertions below discriminate between the conventions.
    expect(coveredTps).not.toBe(leakedTps);
    expect(coveredTps).not.toBe(fullPeriodTps);

    // (1) TPS numerator AND denominator come from the post-drop block set —
    // neither the partial day's transactions nor the selected 30 days leak in.
    const tpsCard = page.getByTestId('stat-tps');
    await expect(tpsCard).toContainText(coveredTps, { timeout: 30000 });
    await expect(tpsCard).not.toContainText(leakedTps);
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

    // (3) All surfaces describe the same block set: the Total Blocks tile
    // matches the post-drop count, and the Daily Summary lists exactly the
    // remaining full days (the partial oldest bucket is gone, so it cannot
    // render as a plausible full-day bar).
    await expect(page.getByTestId('stat-total-blocks')).toContainText(
      counted.length.toLocaleString('en-US'),
    );
    const fullDays = new Set(counted.map(b => b.dateTime.split('T')[0]));
    await expect(page.locator('table tbody tr')).toHaveCount(fullDays.size);
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
