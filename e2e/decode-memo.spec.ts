import { test, expect, FIXTURES, isMocked } from './fixtures';
import { decodeMemo } from '../src/utils/formatters';

/**
 * Unit tests for #68 — decodeMemo must decode real Mina base58check memos to
 * their text (the old base64/atob implementation produced a garbage blob for
 * every real memo). The non-fixture vectors were produced with a reference
 * encoder that was validated against Mina's known empty memo. Pure function.
 */
test.describe('decodeMemo (#68)', () => {
  test('decodes real base58check memos to their text', () => {
    // Real memo taken straight from the e2e fixtures.
    expect(
      decodeMemo('E4YmF9dJ7jBXyD2dKPGRfEtYsZ82fQ2UL3bpB3YVuTCxkcZ6YqVKd'),
    ).toBe('tx-generator');
    expect(
      decodeMemo('E4YXYczkh3RDn4ayEo5fLXQf3U1mZyAVtadozsT41ftMqkqsJxvdM'),
    ).toBe('hello');
    // Multi-byte UTF-8 survives.
    expect(
      decodeMemo('E4YZEnopif4bU1fUqdCr7UG6BPcMcmZCoGXKc1yN9yt6ySPR3NrJH'),
    ).toBe('GM ☀');
    // Full 32-byte memo (the maximum).
    expect(
      decodeMemo('E4ZRby6xj447vdxiMRaqR9v2j9YZrmT358CM6ySe1RaTAdoQnEDg7'),
    ).toBe('0123456789012345678901234567890a');
  });

  test('returns empty string for the empty memo', () => {
    expect(
      decodeMemo('E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH'),
    ).toBe('');
    expect(decodeMemo('')).toBe('');
  });

  test('returns empty string (not the raw blob) for undecodable input', () => {
    expect(decodeMemo('not-a-real-memo')).toBe('');
    expect(decodeMemo('0OIl')).toBe(''); // characters outside the base58 alphabet
    expect(decodeMemo('E4Ym')).toBe(''); // valid base58 but wrong length
  });

  test('renders the decoded memo in the UI, not a base58 blob', async ({
    page,
  }) => {
    test.skip(!isMocked, 'requires the mock harness (CI or MOCK_API=true)');
    // Serve an account-history transaction whose memo is the base58check of
    // "tx-generator"; the account page must show the decoded text.
    await page.route('**/*archive-node-api.gcp.o1test.net/**', async route => {
      let query = '';
      try {
        query = JSON.parse(route.request().postData() || '{}').query || '';
      } catch {
        query = '';
      }
      if (!query.includes('userCommands')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            blocks: [
              {
                blockHeight: 432150,
                stateHash: '3NKmemoBlock000000000000000000000000000000000000',
                dateTime: '2026-02-04T12:30:00.000Z',
                transactions: {
                  userCommands: [
                    {
                      hash: 'CkpMemoTx00000000000000000000000000000000000000000',
                      kind: 'payment',
                      from: FIXTURES.accounts.blockProducer,
                      to: FIXTURES.accounts.knownAccount,
                      amount: '1000000000',
                      fee: '10000000',
                      memo: 'E4YmF9dJ7jBXyD2dKPGRfEtYsZ82fQ2UL3bpB3YVuTCxkcZ6YqVKd',
                      nonce: 1,
                      failureReason: null,
                    },
                  ],
                  zkappCommands: [],
                },
              },
            ],
            networkState: {
              maxBlockHeight: {
                canonicalMaxBlockHeight: 432150,
                pendingMaxBlockHeight: 432150,
              },
            },
          },
        }),
      });
    });

    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);
    await expect(page.getByText('tx-generator').first()).toBeVisible({
      timeout: 20000,
    });
  });
});
