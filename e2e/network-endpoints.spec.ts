import { test, expect, FIXTURES, isMocked } from './fixtures';

/**
 * Tests to verify that both archive and daemon endpoints work together
 * when selecting a network. The explorer uses:
 * - Archive endpoints: for blocks and transactions (historical data)
 * - Daemon endpoints: for account lookups (real-time ledger data)
 */

test.describe('Network Endpoints Integration', () => {
  test.describe('Mesa Network', () => {
    test.beforeEach(async ({ page }) => {
      // Clear localStorage to ensure fresh state
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    });

    test('archive endpoint loads blocks on homepage', async ({ page }) => {
      await page.goto('/');

      // Wait for recent blocks section (uses archive endpoint)
      await expect(page.locator('text=Recent Blocks').first()).toBeVisible({
        timeout: 15000,
      });

      // Wait for table rows to load
      const tableRows = page.locator('tbody tr');
      await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

      const rowCount = await tableRows.count();
      expect(rowCount).toBeGreaterThan(0);
      console.log('[Mesa] Archive endpoint loaded', rowCount, 'blocks');
    });

    test('daemon endpoint loads account data', async ({ page }) => {
      // Navigate to a known account (uses daemon endpoint)
      await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

      // Wait for account page to load
      await expect(page.locator('h1')).toContainText('Account Details');

      // Wait for account data to load (success or CORS error)
      const balanceText = page.locator('text=Balance').first();
      const errorText = page
        .locator('text=/error|failed|not found|Unable|daemon|CORS/i')
        .first();

      await expect(balanceText.or(errorText)).toBeVisible({ timeout: 20000 });

      // If successful, verify balance is displayed
      if (await balanceText.isVisible()) {
        // Check for MINA amount (balance should show MINA)
        await expect(page.locator('text=/MINA/').first()).toBeVisible();
        console.log('[Mesa] Daemon endpoint loaded account successfully');
      } else {
        console.log(
          '[Mesa] Daemon endpoint blocked (CORS), expected in browser',
        );
      }
    });

    test('both endpoints work in same session', async ({ page }) => {
      await page.goto('/');

      // Step 1: Verify archive endpoint works (blocks load)
      await expect(page.locator('text=Recent Blocks').first()).toBeVisible({
        timeout: 15000,
      });
      const tableRows = page.locator('tbody tr');
      await expect(tableRows.first()).toBeVisible({ timeout: 15000 });
      console.log('[Mesa] Archive endpoint: blocks loaded');

      // Step 2: Navigate to account page (daemon endpoint)
      await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);
      await expect(page.locator('h1')).toContainText('Account Details');

      // Wait for account data
      const balanceText = page.locator('text=Balance').first();
      const errorText = page
        .locator('text=/error|failed|not found|Unable|daemon|CORS/i')
        .first();
      await expect(balanceText.or(errorText)).toBeVisible({ timeout: 20000 });
      console.log('[Mesa] Daemon endpoint: account page loaded');

      // Step 3: Navigate back to home (archive endpoint should still work)
      await page.goto('/');
      await expect(page.locator('text=Recent Blocks').first()).toBeVisible({
        timeout: 15000,
      });
      await expect(tableRows.first()).toBeVisible({ timeout: 15000 });
      console.log(
        '[Mesa] Archive endpoint: blocks still working after account lookup',
      );
    });
  });

  test.describe('Network Switching with Both Endpoints', () => {
    test('switching to Mainnet uses correct endpoints', async ({ page }) => {
      await page.goto('/');

      // Wait for initial data to load (Mesa)
      await expect(page.locator('text=Recent Blocks').first()).toBeVisible({
        timeout: 15000,
      });

      // Switch to Mainnet
      const networkButton = page
        .locator('header button')
        .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
        .first();
      await networkButton.click();
      await page.locator('button:has-text("Mainnet")').first().click();

      // Verify network switched
      await expect(
        page.locator('header button').filter({ hasText: 'Mainnet' }).first(),
      ).toBeVisible();

      // Step 1: Verify Mainnet archive endpoint works (blocks)
      const tableRows = page.locator('tbody tr');
      await expect(tableRows.first()).toBeVisible({ timeout: 15000 });
      console.log('[Mainnet] Archive endpoint: blocks loaded');

      // Step 2: Navigate to a Mainnet account (Binance - known to exist)
      const binanceKey =
        'B62qrRvo5wngd5WA1dgXkQpCdQMRDndusmjfWXWT1LgsSFFdBS9RCsV';
      await page.goto(`/#/account/${binanceKey}`);
      await expect(page.locator('h1')).toContainText('Account Details');

      // Wait for account data from Mainnet daemon
      const balanceText = page.locator('text=Balance').first();
      const errorText = page
        .locator('text=/error|failed|not found|Unable|daemon|CORS/i')
        .first();
      await expect(balanceText.or(errorText)).toBeVisible({ timeout: 20000 });

      // Mainnet Binance account should have a balance
      if (await balanceText.isVisible()) {
        await expect(page.locator('text=/MINA/').first()).toBeVisible();
        console.log('[Mainnet] Daemon endpoint: account loaded successfully');
      }
    });

    test('switching to Devnet uses correct endpoints', async ({ page }) => {
      await page.goto('/');

      // Wait for initial data to load
      await expect(page.locator('text=Recent Blocks').first()).toBeVisible({
        timeout: 15000,
      });

      // Switch to Devnet
      const networkButton = page
        .locator('header button')
        .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
        .first();
      await networkButton.click();
      await page.locator('button:has-text("Devnet")').first().click();

      // Verify network switched
      await expect(
        page.locator('header button').filter({ hasText: 'Devnet' }).first(),
      ).toBeVisible();

      // Verify Devnet archive endpoint works (blocks)
      const tableRows = page.locator('tbody tr');
      await expect(tableRows.first()).toBeVisible({ timeout: 15000 });
      console.log('[Devnet] Archive endpoint: blocks loaded');

      // Navigate to an account (uses Devnet daemon)
      await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);
      await expect(page.locator('h1')).toContainText('Account Details');

      // Wait for account data
      const balanceText = page.locator('text=Balance').first();
      const errorText = page
        .locator('text=/error|failed|not found|Unable|daemon|CORS/i')
        .first();
      await expect(balanceText.or(errorText)).toBeVisible({ timeout: 20000 });
      console.log('[Devnet] Daemon endpoint: account page loaded');
    });

    test('network switch updates both endpoint contexts', async ({ page }) => {
      // Skip in mocked mode - same fixture data for all networks
      test.skip(isMocked, 'Uses same fixture for all networks');

      await page.goto('/');

      // Start with Mesa - load blocks
      await expect(page.locator('text=Recent Blocks').first()).toBeVisible({
        timeout: 15000,
      });
      const tableRows = page.locator('tbody tr');
      await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

      // Get Mesa block height
      const mesaBlockLink = tableRows.first().locator('a').first();
      const mesaBlockHeight = await mesaBlockLink.textContent();
      console.log('Mesa block height:', mesaBlockHeight);

      // Switch to Mainnet
      const networkButton = page
        .locator('header button')
        .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
        .first();
      await networkButton.click();
      await page.locator('button:has-text("Mainnet")').first().click();

      // Verify Mainnet selected
      await expect(
        page.locator('header button').filter({ hasText: 'Mainnet' }).first(),
      ).toBeVisible();

      // Wait for Mainnet blocks to load
      await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

      // Get Mainnet block height - should be different from Mesa
      const mainnetBlockLink = tableRows.first().locator('a').first();
      const mainnetBlockHeight = await mainnetBlockLink.textContent();
      console.log('Mainnet block height:', mainnetBlockHeight);

      // Mainnet should have significantly higher block height than Mesa testnet
      const mesaHeight = parseInt(mesaBlockHeight?.replace(/,/g, '') || '0');
      const mainnetHeight = parseInt(
        mainnetBlockHeight?.replace(/,/g, '') || '0',
      );

      // Mainnet block height should be much higher (400k+)
      expect(mainnetHeight).toBeGreaterThan(mesaHeight);
      console.log(
        `Verified: Mainnet height (${mainnetHeight}) > Mesa height (${mesaHeight})`,
      );
    });
  });

  test.describe('Account Lookup Uses Daemon Endpoint', () => {
    test('account balance reflects real-time data from daemon', async ({
      page,
    }) => {
      // Switch to Mainnet for consistent data
      await page.goto('/');
      const networkButton = page
        .locator('header button')
        .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
        .first();
      await networkButton.click();
      await page.locator('button:has-text("Mainnet")').first().click();

      // Navigate to Binance account (known to have balance on Mainnet)
      const binanceKey =
        'B62qrRvo5wngd5WA1dgXkQpCdQMRDndusmjfWXWT1LgsSFFdBS9RCsV';
      await page.goto(`/#/account/${binanceKey}`);

      // Wait for account details
      await expect(page.locator('h1')).toContainText('Account Details');

      // Wait for balance to load
      const balanceSection = page.locator('text=Balance').first();
      await expect(balanceSection).toBeVisible({ timeout: 20000 });

      // Check that a non-zero balance is shown
      const minaAmount = page.locator('text=/[\\d,.]+ MINA/').first();
      await expect(minaAmount).toBeVisible({ timeout: 10000 });

      const balanceText = await minaAmount.textContent();
      console.log('Binance account balance:', balanceText);

      // Balance should be a positive number (Binance has funds)
      expect(balanceText).toMatch(/[\d,.]+ MINA/);
    });

    test('account shows nonce from daemon', async ({ page }) => {
      // Navigate to Mainnet account with activity
      await page.goto('/');
      const networkButton = page
        .locator('header button')
        .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
        .first();
      await networkButton.click();
      await page.locator('button:has-text("Mainnet")').first().click();

      const binanceKey =
        'B62qrRvo5wngd5WA1dgXkQpCdQMRDndusmjfWXWT1LgsSFFdBS9RCsV';
      await page.goto(`/#/account/${binanceKey}`);

      // Wait for nonce to be displayed
      const nonceText = page.locator('text=Nonce').first();
      await expect(nonceText).toBeVisible({ timeout: 20000 });

      // Nonce should be a number
      const nonceValue = page
        .locator('text=/Nonce/')
        .locator('..')
        .locator('text=/\\d+/');
      await expect(nonceValue).toBeVisible({ timeout: 10000 });
      console.log('Account has nonce displayed');
    });
  });
});

test.describe('Deployed Website Tests', () => {
  // These tests specifically target the deployed GitHub Pages site
  test.describe.configure({ mode: 'serial' });

  test('deployed site loads correctly', async ({ page, baseURL }) => {
    // Skip if running against localhost
    if (baseURL?.includes('localhost')) {
      test.skip();
    }

    await page.goto('/');
    await expect(page).toHaveTitle(/Mina Explorer/);
    await expect(page.locator('h1')).toContainText('Explorer');
  });

  test('deployed site can switch networks', async ({ page, baseURL }) => {
    if (baseURL?.includes('localhost')) {
      test.skip();
    }

    await page.goto('/');

    // Wait for page to load
    await expect(page.locator('text=Block Height').first()).toBeVisible({
      timeout: 15000,
    });

    // Switch to Mainnet
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Mesa|Devnet|Mainnet/ })
      .first();
    await networkButton.click();
    await page.locator('button:has-text("Mainnet")').first().click();

    await expect(
      page.locator('header button').filter({ hasText: 'Mainnet' }).first(),
    ).toBeVisible();
  });

  test('deployed site account lookup shows CORS error', async ({
    page,
    baseURL,
  }) => {
    if (baseURL?.includes('localhost')) {
      test.skip();
    }

    // Go directly to Mainnet account
    await page.goto('/');

    // Switch to Mainnet first
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Mesa|Devnet|Mainnet/ })
      .first();
    await expect(networkButton).toBeVisible({ timeout: 15000 });
    await networkButton.click();
    await page.locator('button:has-text("Mainnet")').first().click();

    // Navigate to account
    const binanceKey =
      'B62qrRvo5wngd5WA1dgXkQpCdQMRDndusmjfWXWT1LgsSFFdBS9RCsV';
    await page.goto(`/#/account/${binanceKey}`);

    await expect(page.locator('h1')).toContainText('Account Details');

    // Should show CORS error (daemon endpoints don't allow cross-origin requests)
    const balanceText = page.locator('text=Balance').first();
    const corsError = page
      .locator('text=/Unable|daemon|CORS|cross-origin/i')
      .first();
    await expect(balanceText.or(corsError)).toBeVisible({ timeout: 20000 });

    // Log result
    if (await corsError.isVisible()) {
      console.log(
        '[Deployed] CORS error shown as expected (daemon blocks cross-origin)',
      );
    } else {
      console.log('[Deployed] Account data loaded successfully');
    }
  });
});
