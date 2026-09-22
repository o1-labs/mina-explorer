import { test, expect, FIXTURES } from './fixtures';

// Cryptographically valid payment with field/scalar signature (for validation tests).
//
// Signed for the TESTNET network id. mina-signer mixes the network into the
// signature, so `verify.ts` picks 'mainnet' or 'testnet' from the active network
// and this payload verifies only on a testnet. The two tests that expect
// "Signature is valid" therefore pin `?network=devnet` — they used to rely on the
// default network being a testnet, which stopped being true when mesa was
// decommissioned and mainnet became the default.
const VERIFIABLE_PAYMENT_JSON = JSON.stringify({
  input: {
    to: 'B62qqL54NrFkuiBf3YQHm6g5VAP7qgC3PRiJRGoiAf4sMR1Liu2Z99U',
    from: 'B62qqL54NrFkuiBf3YQHm6g5VAP7qgC3PRiJRGoiAf4sMR1Liu2Z99U',
    fee: '10000000',
    amount: '1000000000',
    nonce: '0',
    memo: '',
    validUntil: '4294967295',
  },
  signature: {
    field:
      '7545941374414503936865922080778019681378514718481296414877447758616852124931',
    scalar:
      '27128786267821164944622931800480400730131280358175515211996102746209373634042',
  },
});

const VALID_PAYMENT_JSON = JSON.stringify({
  input: {
    from: FIXTURES.accounts.blockProducer,
    to: FIXTURES.accounts.knownAccount,
    amount: '1000000000',
    fee: '10000000',
  },
  signature: {
    rawSignature:
      '7mXGz1VE9kntMCrzfBVBiJoypbgPGRCDNdXUFGJZSoCCgFJMLM7v9WGxW37osBFN3JALD8AhxBpbmcqYsBqvmJvY7sandP',
  },
});

const VALID_DELEGATION_JSON = JSON.stringify({
  input: {
    from: FIXTURES.accounts.blockProducer,
    to: FIXTURES.accounts.knownAccount,
    fee: '10000000',
  },
  signature: {
    rawSignature:
      '7mXGz1VE9kntMCrzfBVBiJoypbgPGRCDNdXUFGJZSoCCgFJMLM7v9WGxW37osBFN3JALD8AhxBpbmcqYsBqvmJvY7sandP',
  },
});

const VALID_ZKAPP_JSON = JSON.stringify({
  input: {
    zkappCommand: {
      feePayer: {
        body: { publicKey: FIXTURES.accounts.blockProducer, fee: '10000000' },
      },
      accountUpdates: [],
      memo: 'E4Yd...',
    },
  },
});

test.describe('Broadcast Transaction', () => {
  test('page loads correctly', async ({ page }) => {
    await page.goto('/#/broadcast');

    await expect(page.locator('h1')).toHaveText('Broadcast Transaction');
    await expect(page.locator('textarea')).toBeVisible();

    // Type selector tabs are present
    await expect(page.getByRole('button', { name: 'Payment' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delegation' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'zkApp' })).toBeVisible();

    // Security notice is visible
    await expect(page.locator('text=pre-signed transactions')).toBeVisible();
  });

  test('navigation link works', async ({ page }) => {
    await page.goto('/');

    // Click Broadcast in nav
    await page.locator('nav a[href="#/broadcast"]').first().click();
    await expect(page).toHaveURL(/.*#\/broadcast/);
    await expect(page.locator('h1')).toHaveText('Broadcast Transaction');
  });

  test('type selector switches example template', async ({ page }) => {
    await page.goto('/#/broadcast');

    // Show example
    await page.getByText('Example JSON').click();
    await expect(page.locator('pre')).toContainText('"amount"');

    // Switch to Delegation
    await page.getByRole('button', { name: 'Delegation' }).click();
    await expect(page.locator('pre')).not.toContainText('"amount"');

    // Switch to zkApp
    await page.getByRole('button', { name: 'zkApp' }).click();
    await expect(page.locator('pre')).toContainText('"zkappCommand"');
  });

  test('shows error for invalid JSON', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.locator('textarea').fill('{bad json');
    await page
      .getByRole('button', { name: 'Broadcast Transaction' })
      .click();

    await expect(page.locator('text=Invalid JSON')).toBeVisible();
  });

  test('shows error for missing required fields', async ({ page }) => {
    await page.goto('/#/broadcast');

    // Payment without amount
    await page.locator('textarea').fill(
      JSON.stringify({
        input: {
          from: FIXTURES.accounts.blockProducer,
          to: FIXTURES.accounts.knownAccount,
          fee: '10000000',
        },
        signature: { rawSignature: 'test' },
      }),
    );
    await page
      .getByRole('button', { name: 'Broadcast Transaction' })
      .click();

    await expect(page.locator('text=Missing required field')).toBeVisible();
  });

  test('shows error for missing signature', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.locator('textarea').fill(
      JSON.stringify({
        input: {
          from: FIXTURES.accounts.blockProducer,
          to: FIXTURES.accounts.knownAccount,
          amount: '1000000000',
          fee: '10000000',
        },
      }),
    );
    await page
      .getByRole('button', { name: 'Broadcast Transaction' })
      .click();

    await expect(
      page.getByText('Missing "signature" object'),
    ).toBeVisible();
  });

  test('broadcasts payment successfully', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.locator('textarea').fill(VALID_PAYMENT_JSON);
    await page
      .getByRole('button', { name: 'Broadcast Transaction' })
      .click();

    await expect(
      page.locator('text=Transaction broadcast successfully'),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=CkpMockPaymentHash')).toBeVisible();
  });

  test('broadcasts delegation successfully', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.getByRole('button', { name: 'Delegation' }).click();
    await page.locator('textarea').fill(VALID_DELEGATION_JSON);
    await page
      .getByRole('button', { name: 'Broadcast Transaction' })
      .click();

    await expect(
      page.locator('text=Transaction broadcast successfully'),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=CkpMockDelegationHash')).toBeVisible();
  });

  test('broadcasts zkApp successfully', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.getByRole('button', { name: 'zkApp' }).click();
    await page.locator('textarea').fill(VALID_ZKAPP_JSON);
    await page
      .getByRole('button', { name: 'Broadcast Transaction' })
      .click();

    await expect(
      page.locator('text=Transaction broadcast successfully'),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=CkpMockZkAppHash')).toBeVisible();
  });

  test('signing docs section toggles', async ({ page }) => {
    await page.goto('/#/broadcast');

    const toggle = page.getByText('How to sign a transaction');
    await expect(toggle).toBeVisible();

    // Initially collapsed
    await expect(page.locator('text=mina-signer')).not.toBeVisible();

    // Expand
    await toggle.click();
    await expect(
      page.getByText('npm install mina-signer'),
    ).toBeVisible();
    await expect(page.getByText('dump-keypair')).toBeVisible();

    // Collapse
    await toggle.click();
    await expect(page.getByText('dump-keypair')).not.toBeVisible();
  });

  test('validate button is visible', async ({ page }) => {
    await page.goto('/#/broadcast');

    await expect(
      page.getByRole('button', { name: 'Validate Signature' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Broadcast Transaction' }),
    ).toBeVisible();
  });

  test('validates payment with field/scalar signature', async ({ page }) => {
    await page.goto('/#/broadcast?network=devnet');

    await page.locator('textarea').fill(VERIFIABLE_PAYMENT_JSON);
    await page
      .getByRole('button', { name: 'Validate Signature' })
      .click();

    await expect(page.locator('text=Signature is valid')).toBeVisible();
  });

  test('shows error for invalid signature values', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.locator('textarea').fill(
      JSON.stringify({
        input: {
          to: 'B62qqL54NrFkuiBf3YQHm6g5VAP7qgC3PRiJRGoiAf4sMR1Liu2Z99U',
          from: 'B62qqL54NrFkuiBf3YQHm6g5VAP7qgC3PRiJRGoiAf4sMR1Liu2Z99U',
          fee: '10000000',
          amount: '1000000000',
          nonce: '0',
        },
        signature: { field: '123', scalar: '456' },
      }),
    );
    await page
      .getByRole('button', { name: 'Validate Signature' })
      .click();

    await expect(page.locator('text=verification failed')).toBeVisible();
  });

  test('shows unsupported for rawSignature format', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.locator('textarea').fill(VALID_PAYMENT_JSON);
    await page
      .getByRole('button', { name: 'Validate Signature' })
      .click();

    await expect(page.locator('text=field/scalar')).toBeVisible();
  });

  test('shows unsupported for zkApp validation', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.getByRole('button', { name: 'zkApp' }).click();
    await page.locator('textarea').fill(VALID_ZKAPP_JSON);
    await page
      .getByRole('button', { name: 'Validate Signature' })
      .click();

    await expect(page.locator('text=field/scalar')).toBeVisible();
  });

  test('validate does not broadcast', async ({ page }) => {
    await page.goto('/#/broadcast?network=devnet');

    await page.locator('textarea').fill(VERIFIABLE_PAYMENT_JSON);
    await page
      .getByRole('button', { name: 'Validate Signature' })
      .click();

    await expect(page.locator('text=Signature is valid')).toBeVisible();
    // Should NOT show broadcast success
    await expect(
      page.locator('text=Transaction broadcast successfully'),
    ).not.toBeVisible();
  });

  test('shows tracking hint after broadcast', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.locator('textarea').fill(VALID_PAYMENT_JSON);
    await page
      .getByRole('button', { name: 'Broadcast Transaction' })
      .click();

    await expect(
      page.locator('text=Transaction broadcast successfully'),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=mempool')).toBeVisible();
    await expect(page.locator('text=track its status')).toBeVisible();
  });

  test('broadcast another resets form', async ({ page }) => {
    await page.goto('/#/broadcast');

    await page.locator('textarea').fill(VALID_PAYMENT_JSON);
    await page
      .getByRole('button', { name: 'Broadcast Transaction' })
      .click();

    await expect(
      page.locator('text=Transaction broadcast successfully'),
    ).toBeVisible({ timeout: 10000 });

    // Click "Broadcast Another"
    await page.getByRole('button', { name: 'Broadcast Another' }).click();

    // Form should be cleared and ready
    await expect(page.locator('textarea')).toHaveValue('');
    await expect(
      page.getByRole('button', { name: 'Broadcast Transaction' }),
    ).toBeVisible();
  });
});
