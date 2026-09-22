/**
 * The blocks list reads from mina-explorer-api, not the archive.
 *
 * Every network carries a `restEndpoint` (see networks.ts) and reads this surface through
 * it. These specs exist because the flip is INVISIBLE when it goes wrong: the
 * page renders ten plausible blocks either way, so "the blocks page loads" keeps passing
 * whether the data came from the API, from the archive, or from a stale filter. Each test
 * below pins something that a rendered-content assertion cannot see.
 *
 * They install their own routing rather than reusing setupApiMocks, so they run
 * deterministically outside CI and can COUNT requests per backend.
 *
 * ## Both blocks surfaces now read REST
 *
 *   RecentBlocks (home)    -> useBlocks          -> fetchBlocks          -> REST
 *   BlocksPage (/#/blocks) -> usePaginatedBlocks -> fetchBlocksPaginated -> REST
 *
 * The second moved in the pagination migration. An earlier revision of this file asserted
 * that /#/blocks was archive-backed and said it was "meant to fail" when pagination moved
 * — which is what happened, and is why that test now asserts the opposite.
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import blocksFixture from './fixtures/blocks.json' with { type: 'json' };
import { ARCHIVE_URL, DAEMON_URL, REST_URL } from './mock-api';

const CANONICAL_MAX =
  blocksFixture.data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
const TIP_HEIGHT = blocksFixture.data.blocks[0].blockHeight;

/** Heights above the canonical max are not yet k-finalized: 432149, 432150. */
const PENDING_HEIGHTS = blocksFixture.data.blocks
  .map(b => b.blockHeight)
  .filter(h => h > CANONICAL_MAX);

interface RestCall {
  path: string;
  params: URLSearchParams;
}

/**
 * Route both backends and record every REST call.
 *
 * The archive handler answers rather than failing, deliberately: a test that proves the
 * archive is NOT consulted has to leave it able to answer, or it proves only that the app
 * cannot reach it.
 */
async function routeBoth(
  page: Page,
): Promise<{ restCalls: RestCall[]; archiveBlockQueries: () => number }> {
  const restCalls: RestCall[] = [];
  let archiveBlockQueries = 0;

  await page.route(REST_URL, async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/v1\//, '');
    restCalls.push({ path, params: url.searchParams });

    if (path !== 'blocks') {
      await route.fulfill({ status: 404, body: '{"error":"not found"}' });
      return;
    }

    const type = url.searchParams.get('type') ?? 'ALL';
    const rows = blocksFixture.data.blocks
      .filter(b =>
        type === 'CANONICAL' ? b.blockHeight <= CANONICAL_MAX : true,
      )
      .map(b => ({
        accountAddress: b.creator,
        accountImg: null,
        accountName: null,
        blockHeight: b.blockHeight,
        coinbase: Number(b.transactions.coinbase) / 1e9,
        epoch: b.protocolState?.consensusState?.epoch ?? null,
        globalSlotSinceGenesis:
          b.protocolState?.consensusState?.slotSinceGenesis ?? null,
        isCanonical: b.blockHeight <= CANONICAL_MAX,
        slot: b.protocolState?.consensusState?.slot ?? null,
        stateHash: b.stateHash,
        timestamp: Date.parse(b.dateTime),
        transactionsCount: 0,
      }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: rows,
        totalElements: rows.length,
        totalPages: 1,
        totalCount: rows.length,
      }),
    });
  });

  await page.route(ARCHIVE_URL, async (route: Route) => {
    const query = JSON.parse(route.request().postData() ?? '{}').query ?? '';
    // Key on the OPERATION NAME. An earlier version excluded queries containing
    // `userCommands` to skip block-detail lookups — but BLOCK_LIST_FIELDS selects
    // userCommands too, so that predicate silently matched nothing and the assertion
    // passed by counting zero of everything.
    if (/query GetBlocks[A-Z]/.test(query)) {
      archiveBlockQueries += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(blocksFixture),
    });
  });

  await page.route(DAEMON_URL, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });

  return { restCalls, archiveBlockQueries: () => archiveBlockQueries };
}

/**
 * The tip block's row link.
 *
 * Matched by ROLE, not by text: the page also prints "432,150 total blocks on Mainnet",
 * so a plain text match on the height is ambiguous and fails strict mode.
 */
function tipRow(page: Page) {
  return page.getByRole('link', { name: TIP_HEIGHT.toLocaleString() });
}

test.describe('blocks list via mina-explorer-api', () => {
  test('the blocks list asks the REST backend and not the archive', async ({
    page,
  }) => {
    const { restCalls, archiveBlockQueries } = await routeBoth(page);

    await page.goto('/');
    await expect(tipRow(page)).toBeVisible({ timeout: 15000 });

    const blockCalls = restCalls.filter(c => c.path === 'blocks');
    expect(blockCalls.length).toBeGreaterThan(0);

    // The point of the migration: for this surface the archive is not consulted at all.
    // A fallback would make this flaky rather than failing, which is exactly why there
    // isn't one.
    expect(archiveBlockQueries()).toBe(0);
  });

  test('asks for type=ALL, so the list is the live tip and not 290 blocks stale', async ({
    page,
  }) => {
    const { restCalls } = await routeBoth(page);

    await page.goto('/');
    await expect(tipRow(page)).toBeVisible({ timeout: 15000 });

    const blockCall = restCalls.find(c => c.path === 'blocks');
    expect(blockCall).toBeDefined();

    // `CANONICAL` is the k-FINALIZED prefix, not the best chain — measured at 35 h behind
    // on mainnet, 13 h on devnet. It shipped that way and rendered perfectly: ten real
    // blocks, every field correct, the whole page a day stale. Nothing about the rendered
    // output distinguishes the two, so the request itself is the only place to assert it.
    expect(blockCall?.params.get('type')).toBe('ALL');
    expect(blockCall?.params.get('sortBy')).toBe('HEIGHT');
    expect(blockCall?.params.get('orderBy')).toBe('DESC');
  });

  test('the mapped DTO renders: height, producer, coinbase, time', async ({
    page,
  }) => {
    await routeBoth(page);

    await page.goto('/');
    await expect(tipRow(page)).toBeVisible({ timeout: 15000 });

    const row = page.locator('tr', { has: tipRow(page) });

    // THE UNIT ROUND TRIP. The API hands back a MINA double (720.0); this app carries
    // nanomina and divides by 1e9 to display. Passing the value straight through renders
    // "0.00000072 MINA" — which is exactly what the first version of the mapper did, and
    // exactly the kind of wrong that reads as right in a diff. Assert the DISPLAYED
    // amount, because that is the only place the two unit conventions actually meet.
    await expect(row).toContainText('720.00 MINA');

    // Producer comes through `accountAddress`, which is NOT what the archive calls it
    // (`creator`) — so this fails if the field rename is dropped.
    await expect(row).toContainText(
      blocksFixture.data.blocks[0].creator.slice(0, 6),
    );

    // A rendered relative time proves `timestamp` (epoch ms) survived conversion to the
    // ISO `dateTime` this app uses everywhere. A NaN date renders as "Invalid Date".
    await expect(row).not.toContainText('Invalid Date');
  });

  // NOTE: canonicality is deliberately NOT asserted here. RecentBlocks — the surface that
  // reads REST — renders no Pending badge; that markup lives in BlockList, which only
  // /#/blocks uses, and that page is still archive-backed. `mapRestBlockToSummary` does set
  // `canonical` from `isCanonical`, and it becomes observable when pagination moves. An
  // assertion on the badge here would have been testing the archive path and reading like
  // REST coverage.

  test('/#/blocks now reads REST too, and asks for a zero-based page', async ({
    page,
  }) => {
    const { restCalls, archiveBlockQueries } = await routeBoth(page);

    await page.goto('/#/blocks');
    await expect(tipRow(page)).toBeVisible({ timeout: 15000 });

    // The boundary this replaces asserted the OPPOSITE — that /#/blocks was still archive
    // backed — and was written to fail when pagination moved. It has.
    expect(restCalls.filter(c => c.path === 'blocks').length).toBeGreaterThan(
      0,
    );
    expect(archiveBlockQueries()).toBe(0);

    // The app pages from 1, the API from 0. Off by one here shows page 2 on page 1 and
    // silently hides the newest 25 blocks — rendered output looks entirely normal.
    const first = restCalls.find(c => c.path === 'blocks');
    expect(first?.params.get('page')).toBe('0');
    expect(first?.params.get('type')).toBe('ALL');
  });

  test('the page count comes from totalCount, NOT the capped totalElements', async ({
    page,
  }) => {
    // The trap this pins: the API caps `totalElements` at 10 000 for Blockberry parity and
    // derives `totalPages` from that cap, while `totalCount` carries the true row count.
    // Measured on mesa (a testnet since retired): totalCount 16 876 against totalPages 400.
    // Deep paging works fine
    // past the cap, so a reader that trusted totalElements/totalPages would hide a third of
    // the chain behind a control claiming it does not exist — with no error anywhere.
    const TOTAL = 16876;
    await page.route(REST_URL, async (route: Route) => {
      const url = new URL(route.request().url());
      const size = Number(url.searchParams.get('size') ?? 25);
      const rows = blocksFixture.data.blocks.slice(0, size).map(b => ({
        accountAddress: b.creator,
        accountImg: null,
        accountName: null,
        blockHeight: b.blockHeight,
        coinbase: Number(b.transactions.coinbase) / 1e9,
        epoch: null,
        globalSlotSinceGenesis: null,
        isCanonical: b.blockHeight <= CANONICAL_MAX,
        slot: null,
        stateHash: b.stateHash,
        timestamp: Date.parse(b.dateTime),
        transactionsCount: 0,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: rows,
          totalElements: 10000, // the parity cap
          totalPages: 400, // derived from the cap — deliberately wrong for our purposes
          totalCount: TOTAL, // the truth
        }),
      });
    });
    await page.route(ARCHIVE_URL, async (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(blocksFixture),
      }),
    );
    await page.route(DAEMON_URL, async (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      }),
    );

    await page.goto('/#/blocks');
    await expect(tipRow(page)).toBeVisible({ timeout: 15000 });

    // 16 876 / 20 = 844 pages. Reading totalElements would say 400; totalPages, 400.
    // The page number is an input now, so "Page 1" is asserted on its value rather than as
    // part of the sentence — dropping it would have left the starting page unpinned.
    await expect(page.getByTestId('blocks-page-number')).toHaveValue('1');
    await expect(page.getByText('of 844')).toBeVisible();
    // And the footer states the real block count, not the tip height.
    await expect(
      page.getByText(`${TOTAL.toLocaleString()} total blocks`),
    ).toBeVisible();
  });
});
