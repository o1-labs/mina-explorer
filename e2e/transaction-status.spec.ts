import { test, expect, FIXTURES } from './fixtures';

/**
 * Regression tests for #67 — a failed on-chain transaction (funds did not
 * move) must never be presented as successful.
 */
const FAILED_HASH = 'CkpFai1ed00000000000000000000000000000000000000000';
const REASON = 'Amount_insufficient_to_create_account';

// An archive-shaped blocks response containing the given user commands.
function blocksPayload(userCommands: unknown[]): unknown {
  return {
    data: {
      blocks: [
        {
          blockHeight: 432150,
          stateHash: '3NKFai1edB1ock00000000000000000000000000000000000',
          dateTime: '2026-02-04T12:30:00.000Z',
          transactions: { userCommands, zkappCommands: [] },
        },
      ],
      networkState: {
        maxBlockHeight: {
          canonicalMaxBlockHeight: 432150,
          pendingMaxBlockHeight: 432150,
        },
      },
    },
  };
}

function failedCommand(from: string, to: string): unknown {
  return {
    hash: FAILED_HASH,
    kind: 'payment',
    from,
    to,
    amount: '5000000000',
    fee: '10000000',
    memo: 'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4YNTv97JEVmSiaqifp',
    nonce: 7,
    status: 'failed',
    failureReason: REASON,
  };
}

// Serve a single failed user command from the archive (the source for both
// the transaction-detail search and account history).
async function mockFailedTx(
  page: import('@playwright/test').Page,
  from: string,
  to: string,
): Promise<void> {
  await page.route('**/*archive-node-api.gcp.o1test.net/**', async route => {
    let query = '';
    try {
      query = JSON.parse(route.request().postData() || '{}').query || '';
    } catch {
      query = '';
    }
    if (query.includes('userCommands')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(blocksPayload([failedCommand(from, to)])),
      });
      return;
    }
    await route.fallback();
  });
}

test.describe('Transaction status (#67)', () => {
  test('a failed transaction shows "Failed", not "Confirmed"', async ({
    page,
  }) => {
    await mockFailedTx(
      page,
      FIXTURES.accounts.blockProducer,
      FIXTURES.accounts.knownAccount,
    );

    await page.goto(`/#/transaction/${FAILED_HASH}`);

    await expect(page.locator('h2')).toContainText('Transaction Details', {
      timeout: 20000,
    });
    await expect(page.getByText('Failed').first()).toBeVisible();
    await expect(page.getByText('Confirmed')).toHaveCount(0);
    await expect(page.getByText(REASON)).toBeVisible();
  });

  test('account history flags a failed received payment and de-emphasizes its amount', async ({
    page,
  }) => {
    // The account we view is the *recipient*, so before the fix this rendered
    // as a green "+5 MINA" received entry.
    await mockFailedTx(
      page,
      FIXTURES.accounts.knownAccount,
      FIXTURES.accounts.blockProducer,
    );

    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // The failure is surfaced...
    await expect(page.getByText('Failed').first()).toBeVisible({
      timeout: 20000,
    });
    // ...and the amount is struck through, not a normal "+received" figure.
    await expect(
      page.locator('.line-through').filter({ hasText: 'MINA' }).first(),
    ).toBeVisible();
  });

  test('the confirmed transactions list marks a failed transaction', async ({
    page,
  }) => {
    await mockFailedTx(
      page,
      FIXTURES.accounts.blockProducer,
      FIXTURES.accounts.knownAccount,
    );

    // /transactions opens on the Confirmed tab, which renders TransactionList.
    await page.goto('/#/transactions');

    await expect(page.getByText('Failed').first()).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.locator('.line-through').filter({ hasText: 'MINA' }).first(),
    ).toBeVisible();
  });
});
