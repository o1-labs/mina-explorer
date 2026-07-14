import { test, expect, isMocked } from './fixtures';

/**
 * #70 — on an archive WITHOUT the transaction-details extension, the block
 * summary card used to show "Transaction Fees 0.00 / Snark Fees 0.00" while the
 * per-transaction tables below (filled by daemon enrichment) listed the real
 * fees. The fix recomputes the summary from the enriched transactions so it
 * always matches the tables.
 *
 * This simulates that archive: the FULL block-detail query (which selects
 * userCommands) errors as if the schema lacks those fields, forcing the BASIC
 * fallback (which leaves the summary at 0); the daemon then supplies the
 * transactions with fees. Requires the mock harness.
 */
test.describe('block fees summary (#70)', () => {
  const HEIGHT = 500000;
  const B62 = 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg';

  const getQuery = (postData: string | null): string => {
    try {
      return JSON.parse(postData || '{}').query || '';
    } catch {
      return '';
    }
  };

  test('recomputes the summary from daemon-enriched tables (no extension)', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');

    // Archive: FULL block-detail query (has userCommands) errors as if the
    // tx-detail extension is absent; the BASIC query returns a bare block.
    await page.route(/archive-node-api/, async route => {
      const q = getQuery(route.request().postData());
      if (!q.includes('GetBlockByHeight')) {
        await route.fallback();
        return;
      }
      if (q.includes('userCommands')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [
              { message: 'Cannot query field "userCommands" on type "Block".' },
            ],
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            blocks: [
              {
                blockHeight: HEIGHT,
                stateHash:
                  '3NKmesaNoExtBlock0000000000000000000000000000000000',
                creator: B62,
                dateTime: '2026-03-01T00:00:00.000Z',
                transactions: { coinbase: '720000000000' },
              },
            ],
            networkState: {
              maxBlockHeight: {
                canonicalMaxBlockHeight: HEIGHT + 10,
                pendingMaxBlockHeight: HEIGHT + 10,
              },
            },
          },
        }),
      });
    });

    // Daemon: supply the block's transactions with distinctive fees.
    //   txFees   = 0.111 + 0.222            = 0.333 MINA
    //   snarkFees = 0.055 (Fee_transfer only, coinbase transfer excluded)
    await page.route(/graphql/, async route => {
      const q = getQuery(route.request().postData());
      if (!q.includes('block(height:')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            block: {
              protocolState: {
                previousStateHash:
                  '3NKmesaNoExtParent000000000000000000000000000000000',
              },
              transactions: {
                coinbase: '720000000000',
                userCommands: [
                  {
                    hash: 'CkpNoExtTx100000000000000000000000000000000000000',
                    kind: 'PAYMENT',
                    from: B62,
                    to: B62,
                    amount: '1000000000',
                    fee: '111000000',
                    memo: '',
                    nonce: 1,
                    failureReason: null,
                  },
                  {
                    hash: 'CkpNoExtTx200000000000000000000000000000000000000',
                    kind: 'PAYMENT',
                    from: B62,
                    to: B62,
                    amount: '2000000000',
                    fee: '222000000',
                    memo: '',
                    nonce: 2,
                    failureReason: null,
                  },
                ],
                zkappCommands: [],
                feeTransfer: [
                  { recipient: B62, fee: '55000000', type: 'Fee_transfer' },
                  {
                    recipient: B62,
                    fee: '720000000000',
                    type: 'Fee_transfer_via_coinbase',
                  },
                ],
              },
            },
          },
        }),
      });
    });

    await page.goto(`/#/block/${HEIGHT}`);

    // The summary must reflect the enriched tables, not 0.00. 0.333 is the sum
    // of the two payment fees (0.111 + 0.222) — it appears only in the summary,
    // never as an individual row — so seeing it proves the recompute ran.
    await expect(page.getByText('Transaction Fees').first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/0\.333/).first()).toBeVisible();
    await expect(page.getByText(/0\.055/).first()).toBeVisible();
  });
});
