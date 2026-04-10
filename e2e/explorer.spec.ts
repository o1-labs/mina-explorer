import { test, expect, FIXTURES, isMocked } from './fixtures';

test.describe('Mina Explorer', () => {
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/Mina Explorer/);

    // Check header logo link (Mina is an image + "Explorer" text)
    await expect(page.locator('header a').first()).toBeVisible();

    // Check search bar is present (use first() to handle multiple)
    await expect(
      page.locator('input[placeholder*="Search"]').first(),
    ).toBeVisible();

    // Check network stats section
    await expect(page.locator('text=Network').first()).toBeVisible();
    await expect(page.locator('text=Block Height').first()).toBeVisible();
  });

  test('network stats load data', async ({ page }) => {
    await page.goto('/');

    // Wait for network stats section to load
    const blockHeightSection = page
      .locator('div')
      .filter({ hasText: /^Block Height/ })
      .first();
    await expect(blockHeightSection).toBeVisible({ timeout: 15000 });

    // Check that block height is displayed as a number (look for formatted number)
    const blockHeightText = await page
      .locator('text=/[\\d,]+/')
      .first()
      .textContent();
    console.log('Block Height:', blockHeightText);

    // Verify it's a valid number (with commas for formatting)
    expect(blockHeightText).toMatch(/[\d,]+/);
  });

  test('epoch and slot progress displayed', async ({ page }) => {
    await page.goto('/');

    // Wait for network stats to load
    await expect(page.locator('text=Block Height').first()).toBeVisible({
      timeout: 15000,
    });

    // Check that Epoch section exists
    await expect(page.locator('text=Epoch').first()).toBeVisible();

    // Wait for epoch data to load (should show a number, not '-')
    // The epoch number should be visible
    const epochCard = page
      .locator('div')
      .filter({ hasText: /^Epoch/ })
      .first();
    await expect(epochCard).toBeVisible();

    // Check for slot progress text (shows "X / 7,140 slots")
    await expect(page.locator('text=/slots/')).toBeVisible({ timeout: 10000 });
  });

  test('recent blocks load', async ({ page }) => {
    await page.goto('/');

    // Wait for recent blocks section
    const recentBlocksSection = page.locator('text=Recent Blocks').first();
    await expect(recentBlocksSection).toBeVisible({ timeout: 15000 });

    // Wait for table rows to load
    const tableRows = page.locator('tbody tr');

    // Wait for data to appear
    await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

    const rowCount = await tableRows.count();
    console.log('Number of blocks loaded:', rowCount);
    expect(rowCount).toBeGreaterThan(0);

    // Check that block height links are present
    const firstBlockLink = tableRows.first().locator('a').first();
    await expect(firstBlockLink).toBeVisible();

    const blockHeight = await firstBlockLink.textContent();
    console.log('First block height:', blockHeight);
  });

  test('blocks page loads', async ({ page }) => {
    await page.goto('/#/blocks');

    // Check page heading (now h1 with Tailwind)
    await expect(page.locator('h1')).toContainText('Blocks');

    // Wait for table rows to load
    const tableRows = page.locator('tbody tr');
    await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

    const rowCount = await tableRows.count();
    console.log('Number of blocks on blocks page:', rowCount);
    expect(rowCount).toBeGreaterThan(0);
  });

  test('block detail page loads directly', async ({ page }) => {
    // Go to a specific block directly using fixture
    await page.goto(`/#/block/${FIXTURES.blocks.knownHeight}`);

    // Wait for block detail page to load
    await expect(page.locator('h2').filter({ hasText: /Block #/ })).toBeVisible(
      { timeout: 15000 },
    );

    // Check that block details are displayed
    await expect(page.locator('text=State Hash').first()).toBeVisible();
    await expect(page.locator('text=Block Producer').first()).toBeVisible();
    await expect(page.locator('text=Timestamp').first()).toBeVisible();
  });

  test('block detail page loads from link', async ({ page }) => {
    await page.goto('/');

    // Wait for recent blocks section
    await expect(page.locator('text=Recent Blocks').first()).toBeVisible({
      timeout: 15000,
    });

    // Wait for table rows to load
    const tableRows = page.locator('tbody tr');
    await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

    const firstBlockLink = tableRows.first().locator('a').first();
    await expect(firstBlockLink).toBeVisible();

    const blockHeight = await firstBlockLink.textContent();
    console.log('Clicking on block:', blockHeight);

    await firstBlockLink.click();

    // Wait for block detail page to load
    await expect(page.locator('h2').filter({ hasText: /Block #/ })).toBeVisible(
      { timeout: 15000 },
    );

    // Check that block details are displayed
    await expect(page.locator('text=State Hash').first()).toBeVisible();
    await expect(page.locator('text=Block Producer').first()).toBeVisible();
  });

  test('block detail page shows transactions', async ({ page }) => {
    // Go to a specific block with transactions
    await page.goto(`/#/block/${FIXTURES.blocks.knownHeight}`);

    // Wait for block detail page to load
    await expect(page.locator('h2').filter({ hasText: /Block #/ })).toBeVisible(
      { timeout: 15000 },
    );

    // Check that transactions section exists
    await expect(page.locator('h3:has-text("Transactions")')).toBeVisible();

    // Check that transaction tabs are present
    await expect(
      page.locator('button:has-text("User Commands")'),
    ).toBeVisible();
    await expect(
      page.locator('button:has-text("zkApp Commands")'),
    ).toBeVisible();
    await expect(
      page.locator('button:has-text("Fee Transfers")'),
    ).toBeVisible();

    // Check transaction count is displayed in tabs
    await expect(page.locator('text=/User Commands \\(\\d+\\)/')).toBeVisible();

    // Check that fee and snark fields are shown
    await expect(page.locator('text=Transaction Fees').first()).toBeVisible();
    await expect(page.locator('text=Snark Fees').first()).toBeVisible();
  });

  test('search by block height works', async ({ page }) => {
    await page.goto('/');

    // Type in search box and submit using fixture
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill(String(FIXTURES.blocks.knownHeight));
    await searchInput.press('Enter');

    // Should navigate to block detail page
    await expect(page).toHaveURL(
      new RegExp(`/block/${FIXTURES.blocks.knownHeight}`),
    );
    await expect(page.locator('h2').filter({ hasText: /Block #/ })).toBeVisible(
      { timeout: 15000 },
    );
  });

  test('network selector shows current network', async ({ page }) => {
    await page.goto('/');

    // Check that network selector button is visible with Mesa text (use first for desktop)
    const networkButton = page
      .locator('header button')
      .filter({ hasText: 'Mesa' })
      .first();
    await expect(networkButton).toBeVisible();
  });

  test('navigation works', async ({ page }) => {
    await page.goto('/');

    // Click on Blocks link in navbar (desktop nav)
    await page.locator('nav a:has-text("Blocks")').first().click();
    await expect(page).toHaveURL(/\/blocks/);

    // Click on logo to go back home. The URL sync effect re-appends
    // ?network=<id> after navigation, so the route may end with a query string.
    await page.locator('header a').first().click();
    await expect(page).toHaveURL(/\/#\/?(\?network=[^/]+)?$/);
  });

  test('404 page for invalid routes', async ({ page }) => {
    await page.goto('/#/invalid-route-that-does-not-exist');

    await expect(page.locator('text=404')).toBeVisible();
    await expect(page.locator('text=Page Not Found')).toBeVisible();
  });

  test('refresh button works on blocks page', async ({ page }) => {
    await page.goto('/#/blocks');

    // Wait for table rows to load
    const tableRows = page.locator('tbody tr');
    await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

    // Click refresh button
    const refreshButton = page.locator('button:has-text("Refresh")');
    await refreshButton.click();

    // Blocks should still be visible after refresh
    await expect(tableRows.first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Network Picker', () => {
  test('dropdown shows all available networks', async ({ page }) => {
    await page.goto('/');

    // Click on network selector dropdown (use first for desktop)
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
      .first();
    await expect(networkButton).toBeVisible();
    await networkButton.click();

    // Check that all three networks are listed in dropdown
    await expect(page.locator('button:has-text("Mesa")').first()).toBeVisible();
    await expect(
      page.locator('button:has-text("Devnet")').first(),
    ).toBeVisible();
    await expect(
      page.locator('button:has-text("Mainnet")').first(),
    ).toBeVisible();
  });

  test('default network is Mesa with testnet badge', async ({ page }) => {
    await page.goto('/');

    // Check that Mesa is selected by default (use first for desktop)
    const networkButton = page
      .locator('header button')
      .filter({ hasText: 'Mesa' })
      .first();
    await expect(networkButton).toBeVisible();

    // Check that testnet badge is shown
    await expect(networkButton.locator('text=Testnet')).toBeVisible();
  });

  test('can switch to Devnet', async ({ page }) => {
    await page.goto('/');

    // Wait for initial data to load
    await expect(page.locator('text=Block Height').first()).toBeVisible({
      timeout: 15000,
    });

    // Click on network selector (use first for desktop)
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
      .first();
    await networkButton.click();

    // Click on Devnet (in dropdown)
    await page.locator('button:has-text("Devnet")').first().click();

    // Verify network button now shows Devnet
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible();

    // Verify testnet badge is still shown
    await expect(
      page
        .locator('header button')
        .filter({ hasText: 'Devnet' })
        .first()
        .locator('text=Testnet'),
    ).toBeVisible();
  });

  test('can switch to Mainnet', async ({ page }) => {
    await page.goto('/');

    // Wait for initial data to load
    await expect(page.locator('text=Block Height').first()).toBeVisible({
      timeout: 15000,
    });

    // Click on network selector (use first for desktop)
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
      .first();
    await networkButton.click();

    // Click on Mainnet (in dropdown)
    await page.locator('button:has-text("Mainnet")').first().click();

    // Verify network button now shows Mainnet
    const mainnetButton = page
      .locator('header button')
      .filter({ hasText: 'Mainnet' })
      .first();
    await expect(mainnetButton).toBeVisible();

    // Verify testnet badge is NOT shown (Mainnet is not a testnet)
    await expect(mainnetButton.locator('text=Testnet')).not.toBeVisible();
  });

  test('network switch persists after navigation', async ({ page }) => {
    await page.goto('/');

    // Switch to Devnet (use first for desktop)
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
      .first();
    await networkButton.click();

    await page.locator('button:has-text("Devnet")').first().click();

    // Verify Devnet is selected
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible();

    // Navigate to blocks page (desktop nav)
    await page.locator('nav a:has-text("Blocks")').first().click();
    await expect(page).toHaveURL(/\/blocks/);

    // Verify Devnet is still selected
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible();

    // Navigate back to home
    await page.locator('header a').first().click();

    // Verify Devnet is still selected
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible();
  });

  test('network switch reloads blocks data', async ({ page }) => {
    await page.goto('/');

    // Wait for recent blocks section
    await expect(page.locator('text=Recent Blocks').first()).toBeVisible({
      timeout: 15000,
    });

    // Wait for table rows to load
    const tableRows = page.locator('tbody tr');
    await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

    // Get first block height before switch
    const firstBlockBefore = await tableRows
      .first()
      .locator('a')
      .first()
      .textContent();
    console.log('Block height before network switch:', firstBlockBefore);

    // Switch to Devnet (use first for desktop)
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
      .first();
    await networkButton.click();

    await page.locator('button:has-text("Devnet")').first().click();

    // Wait for data to reload
    await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

    // Verify network switch triggered a response
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible();
  });

  test('network selection persists after page refresh', async ({ page }) => {
    await page.goto('/');

    // Switch to Mainnet (use first for desktop)
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
      .first();
    await networkButton.click();

    await page.locator('button:has-text("Mainnet")').first().click();
    await expect(
      page.locator('header button').filter({ hasText: 'Mainnet' }).first(),
    ).toBeVisible();

    // Refresh the page
    await page.reload();

    // Wait for page to load (check header logo link)
    await expect(page.locator('header a').first()).toBeVisible();

    // Verify Mainnet is still selected after refresh
    await expect(
      page.locator('header button').filter({ hasText: 'Mainnet' }).first(),
    ).toBeVisible();
  });

  test('block height updates when switching networks', async ({ page }) => {
    // Skip in mocked mode - same fixture data for all networks
    test.skip(isMocked, 'Uses same fixture for all networks');

    await page.goto('/');

    // Wait for network stats to load
    await expect(page.locator('text=Block Height').first()).toBeVisible({
      timeout: 15000,
    });

    // Get Mesa block height (wait for a number to appear)
    await expect(async () => {
      const text = await page.locator('text=/[\\d,]+/').first().textContent();
      expect(text).toMatch(/[\d,]+/);
    }).toPass({ timeout: 15000 });

    const mesaHeight = await page
      .locator('text=/[\\d,]+/')
      .first()
      .textContent();
    console.log('Mesa block height:', mesaHeight);

    // Switch to Devnet (use first for desktop)
    const networkButton = page
      .locator('header button')
      .filter({ hasText: /Pre-Mesa|Mesa|Devnet|Mainnet/ })
      .first();
    await networkButton.click();

    await page.locator('button:has-text("Devnet")').first().click();

    // Verify network switch
    await expect(
      page.locator('header button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible();

    // Wait for the block height to change
    await expect(async () => {
      const devnetHeight = await page
        .locator('text=/[\\d,]+/')
        .first()
        .textContent();
      expect(devnetHeight).not.toBe(mesaHeight);
      expect(devnetHeight).not.toBe('-');
    }).toPass({ timeout: 15000 });

    const devnetHeight = await page
      .locator('text=/[\\d,]+/')
      .first()
      .textContent();
    console.log('Devnet block height:', devnetHeight);

    // Devnet should have a different block height than Mesa
    expect(devnetHeight).not.toBe(mesaHeight);
  });
});

test.describe('Account Page', () => {
  test('account page loads with valid public key', async ({ page }) => {
    // Navigate to a known account using fixture
    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // Wait for account page to load
    await expect(page.locator('h1')).toContainText('Account Details');

    // Wait for account card to appear (use specific heading)
    await expect(
      page.getByRole('heading', { name: 'Account', exact: true }),
    ).toBeVisible({ timeout: 20000 });
  });

  test('account page handles API response', async ({ page }) => {
    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Account Details');

    // Wait for account card to appear (use specific heading)
    const accountCard = page.getByRole('heading', {
      name: 'Account',
      exact: true,
    });

    await expect(accountCard).toBeVisible({ timeout: 25000 });

    // Check for basic info
    await expect(page.locator('text=Public Key').first()).toBeVisible();
    await expect(page.locator('text=Balance').first()).toBeVisible();
  });

  test('account page shows error for invalid account', async ({ page }) => {
    // Navigate to an invalid account
    await page.goto(`/#/account/${FIXTURES.accounts.invalidAccount}`);

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Account Details');

    // Should show error or not found message
    await expect(page.locator('text=/not found|error/i').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('can navigate to account from block producer link', async ({ page }) => {
    // Go to a block detail page
    await page.goto(`/#/block/${FIXTURES.blocks.knownHeight}`);

    // Wait for block to load
    await expect(page.locator('h2').filter({ hasText: /Block #/ })).toBeVisible(
      { timeout: 15000 },
    );

    // Find the block producer link and click it
    const producerRow = page.locator('text=Block Producer').locator('..');
    const producerLink = producerRow.locator('a');
    await expect(producerLink).toBeVisible();

    await producerLink.click();

    // Should navigate to account page
    await expect(page).toHaveURL(/\/account\//);
    await expect(page.locator('h1')).toContainText('Account Details');
  });

  test('search by public key navigates to account page', async ({ page }) => {
    await page.goto('/');

    // Type a public key in search box
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill(FIXTURES.accounts.blockProducer);
    await searchInput.press('Enter');

    // Should navigate to account page
    await expect(page).toHaveURL(
      new RegExp(`/account/${FIXTURES.accounts.blockProducer}`),
    );
    await expect(page.locator('h1')).toContainText('Account Details');
  });
});

test.describe('Transaction Search', () => {
  test('search by transaction hash navigates to transaction page', async ({
    page,
  }) => {
    await page.goto('/');

    // Type a transaction hash in search box
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill(FIXTURES.transactions.userCommand);
    await searchInput.press('Enter');

    // Should navigate to transaction page
    await expect(page).toHaveURL(
      new RegExp(`/transaction/${FIXTURES.transactions.userCommand}`),
    );
    await expect(page.locator('h2')).toContainText('Transaction Details');
  });

  test('transaction detail page shows user command details', async ({
    page,
  }) => {
    // Go directly to transaction page
    await page.goto(`/#/transaction/${FIXTURES.transactions.userCommand}`);

    // Wait for transaction detail to load
    await expect(page.locator('h2')).toContainText('Transaction Details', {
      timeout: 15000,
    });

    // Check for key fields
    await expect(page.locator('text=Transaction Hash').first()).toBeVisible();
    await expect(page.locator('text=From').first()).toBeVisible();
    await expect(page.locator('text=To').first()).toBeVisible();
    await expect(page.locator('text=Amount').first()).toBeVisible();
    await expect(page.locator('text=Fee').first()).toBeVisible();
  });

  test('transaction detail page shows status badges', async ({ page }) => {
    await page.goto(`/#/transaction/${FIXTURES.transactions.userCommand}`);

    // Wait for page to load
    await expect(page.locator('h2')).toContainText('Transaction Details', {
      timeout: 15000,
    });

    // Should show status badge (Pending or Confirmed)
    const statusBadge = page.locator('text=/Pending|Confirmed/').first();
    await expect(statusBadge).toBeVisible();

    // Should show transaction type badge
    const typeBadge = page.locator('text=/PAYMENT|STAKE_DELEGATION|zkApp/');
    await expect(typeBadge.first()).toBeVisible();
  });

  test('transaction not found shows error message', async ({ page }) => {
    // Go to a non-existent transaction
    await page.goto('/#/transaction/CkpInvalidTransactionHash12345');

    // Should show error message
    await expect(
      page.locator('text=/not found|Transaction not found/i').first(),
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Account Transaction History', () => {
  test('account page shows transaction history section', async ({ page }) => {
    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // Wait for account to load
    await expect(
      page.getByRole('heading', { name: 'Account', exact: true }),
    ).toBeVisible({ timeout: 20000 });

    // Check for Transaction History section
    await expect(
      page.getByRole('heading', { name: 'Transaction History' }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('transaction history shows transaction count', async ({ page }) => {
    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // Wait for account to load
    await expect(
      page.getByRole('heading', { name: 'Account', exact: true }),
    ).toBeVisible({ timeout: 20000 });

    // Check for transaction count text
    await expect(page.locator('text=/\\d+ transactions found/')).toBeVisible({
      timeout: 10000,
    });
  });

  test('account page shows MinaScan link', async ({ page }) => {
    await page.goto(`/#/account/${FIXTURES.accounts.blockProducer}`);

    // Wait for account to load
    await expect(
      page.getByRole('heading', { name: 'Account', exact: true }),
    ).toBeVisible({ timeout: 20000 });

    // Check for MinaScan link
    const minascanLink = page
      .locator('a')
      .filter({ hasText: 'See on MinaScan' });
    await expect(minascanLink).toBeVisible();

    // Verify it's an external link with correct href pattern
    await expect(minascanLink).toHaveAttribute('target', '_blank');
    await expect(minascanLink).toHaveAttribute(
      'href',
      new RegExp(`minascan.io/.*/account/${FIXTURES.accounts.blockProducer}`),
    );
  });
});

test.describe('Staking Page', () => {
  test('staking page loads and shows block producers', async ({ page }) => {
    await page.goto('/#/staking');

    // Check page title
    await expect(page.locator('h1')).toContainText('Block Producers');

    // Wait for producers to load
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Check for table headers
    await expect(page.locator('th').filter({ hasText: 'Rank' })).toBeVisible();
    await expect(
      page.locator('th').filter({ hasText: 'Block Producer' }),
    ).toBeVisible();
    await expect(
      page.locator('th').filter({ hasText: 'Blocks Produced' }),
    ).toBeVisible();
    await expect(page.locator('th').filter({ hasText: 'Share' })).toBeVisible();
  });

  test('staking page shows active producers count', async ({ page }) => {
    await page.goto('/#/staking');

    // Wait for stats to load
    await expect(page.locator('text=Active Producers')).toBeVisible({
      timeout: 15000,
    });

    // Should show a number for active producers
    const statsCard = page
      .locator('div')
      .filter({ hasText: /Active Producers/ })
      .first();
    await expect(statsCard).toBeVisible();
  });

  test('staking page navigation link works', async ({ page }) => {
    await page.goto('/');

    // Click staking link in navigation
    await page.locator('nav a').filter({ hasText: 'Staking' }).first().click();

    // Should navigate to staking page
    await expect(page).toHaveURL(/\/staking/);
    await expect(page.locator('h1')).toContainText('Block Producers');
  });

  test('staking page shows top producer badge', async ({ page }) => {
    await page.goto('/#/staking');

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Check for "Top Producer" badge on first row
    await expect(page.locator('text=Top Producer')).toBeVisible();
  });

  test('staking page shows time period selector', async ({ page }) => {
    await page.goto('/#/staking');

    // Wait for page to load
    await expect(page.locator('text=Time period:')).toBeVisible({
      timeout: 15000,
    });

    // Check for time period buttons
    await expect(
      page.locator('button').filter({ hasText: 'Last 24 hours' }),
    ).toBeVisible();
    await expect(
      page.locator('button').filter({ hasText: 'Last 7 days' }),
    ).toBeVisible();
    await expect(
      page.locator('button').filter({ hasText: 'Last 30 days' }),
    ).toBeVisible();
    await expect(
      page.locator('button').filter({ hasText: /Last epoch/i }),
    ).toBeVisible();
  });

  test('staking page time period selector changes data', async ({ page }) => {
    await page.goto('/#/staking');

    // Wait for initial load (default is 7 days)
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Click on "Last 24 hours"
    await page.locator('button').filter({ hasText: 'Last 24 hours' }).click();

    // Wait for new data to load - check that "Blocks in Period" stat is visible
    await expect(page.locator('text=Blocks in Period')).toBeVisible({
      timeout: 15000,
    });
  });

  test('staking page shows date range info', async ({ page }) => {
    await page.goto('/#/staking');

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Check for date range display
    await expect(page.locator('text=/Showing data from/i')).toBeVisible();
  });
});

test.describe('zkApps Page', () => {
  test('zkApps page loads and shows header', async ({ page }) => {
    await page.goto('/#/zkapps');

    // Check page title
    await expect(page.locator('h1')).toContainText('zkApp Explorer');

    // Check for description
    await expect(page.locator('text=/recently active zkApps/i')).toBeVisible();
  });

  test('zkApps page shows stats cards', async ({ page }) => {
    await page.goto('/#/zkapps');

    // Wait for stats to load
    await expect(page.locator('text=Active zkApps')).toBeVisible({
      timeout: 15000,
    });

    // Check for recent transactions stat
    await expect(page.locator('text=Recent Transactions')).toBeVisible();
  });

  test('zkApps page navigation link works', async ({ page }) => {
    await page.goto('/');

    // Click zkApps link in navigation
    await page.locator('nav a').filter({ hasText: 'zkApps' }).first().click();

    // Should navigate to zkApps page
    await expect(page).toHaveURL(/\/zkapps/);
    await expect(page.locator('h1')).toContainText('zkApp Explorer');
  });

  test('zkApps page shows zkApp activity when available', async ({ page }) => {
    await page.goto('/#/zkapps');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('zkApp Explorer');

    // Either shows a table with zkApps or "No zkApp Activity Found" message
    const table = page.locator('table');
    const noActivity = page.locator('text=/No zkApp Activity Found/i');

    await expect(table.or(noActivity)).toBeVisible({ timeout: 15000 });
  });
});

test.describe('MINA Price Display', () => {
  test('header shows MINA price', async ({ page }) => {
    await page.goto('/');

    // Wait for price to load (mocked at $0.5432)
    // The price display shows "MINA $X.XX" - use first() for desktop header
    await expect(
      page.locator('header').locator('text=/MINA.*\\$[0-9]/i').first(),
    ).toBeVisible({
      timeout: 15000,
    });
  });

  test('price shows 24h change indicator', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.locator('header')).toBeVisible();

    // Look for percentage change (mocked at 2.35%) in header
    // Should show something like "2.3%" with up/down indicator
    await expect(
      page.locator('header').locator('text=/[0-9]+\\.[0-9]%/i').first(),
    ).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('Fiat Value Display', () => {
  test('block detail shows fiat values for coinbase', async ({ page }) => {
    await page.goto('/#/block/432150');

    // Wait for block details to load
    await expect(page.locator('text=Coinbase Reward')).toBeVisible({
      timeout: 15000,
    });

    // Check that fiat value is displayed (format: "720.00 MINA ($XXX.XX)")
    // Look for the parenthesized fiat amount
    await expect(page.locator('text=/\\(\\$[0-9]/i').first()).toBeVisible();
  });

  test('transaction detail shows fiat value for amount', async ({ page }) => {
    // Navigate to a known transaction
    await page.goto(`/#/transaction/${FIXTURES.transactions.userCommand}`);

    // Wait for transaction details to load
    await expect(page.locator('text=Amount').first()).toBeVisible({
      timeout: 15000,
    });

    // Check for fiat value display (current or historical)
    // Format: "X.XX MINA ($X.XX)" or "X.XX MINA ($X.XX at tx time)"
    await expect(page.locator('text=/\\(\\$[0-9]/i').first()).toBeVisible({
      timeout: 20000,
    });
  });

  test('transaction detail shows fiat value for fee', async ({ page }) => {
    await page.goto(`/#/transaction/${FIXTURES.transactions.userCommand}`);

    // Wait for transaction details to load
    await expect(page.locator('text=Fee').first()).toBeVisible({
      timeout: 15000,
    });

    // Fee row should show fiat value (check for MINA amount with $ value)
    await expect(page.locator('text=/MINA.*\\$/').first()).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('Transaction Not Found', () => {
  test('shows error message when transaction not found', async ({ page }) => {
    // Navigate to a non-existent transaction
    await page.goto('/#/transaction/5JuInvalidHashThatDoesNotExist123456789');

    // Wait for search to complete - should show "Transaction Not Found" or error
    const notFound = page.locator('text=/Transaction Not Found/i');
    const error = page.locator('text=/not found/i');

    await expect(notFound.or(error)).toBeVisible({
      timeout: 20000,
    });
  });
});

test.describe('Copy to Clipboard', () => {
  test('block detail shows copy button for state hash', async ({ page }) => {
    await page.goto('/#/block/432150');

    // Wait for block details to load
    await expect(page.locator('text=State Hash')).toBeVisible({
      timeout: 15000,
    });

    // Check that copy button is present (lucide Copy icon button)
    const stateHashRow = page
      .locator('div')
      .filter({ hasText: 'State Hash' })
      .first();
    await expect(stateHashRow.locator('button').first()).toBeVisible();
  });

  test('account detail shows copy button for public key', async ({ page }) => {
    // Go to a known account (from fixtures)
    await page.goto(
      '/#/account/B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg',
    );

    // Wait for account details to load
    await expect(page.locator('text=Public Key')).toBeVisible({
      timeout: 15000,
    });

    // Check that copy button is present
    const publicKeyRow = page
      .locator('div')
      .filter({ hasText: 'Public Key' })
      .first();
    await expect(publicKeyRow.locator('button').first()).toBeVisible();
  });

  test('hash links show copy button', async ({ page }) => {
    await page.goto('/#/blocks');

    // Wait for blocks table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Hash links should have copy buttons (the small button next to the hash)
    // Look for the first hash link row and check for a button
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow.locator('button').first()).toBeVisible();
  });
});

test.describe('Analytics Page', () => {
  test('analytics page loads and shows header', async ({ page }) => {
    await page.goto('/#/analytics');

    // Check page title
    await expect(page.locator('h1')).toContainText('Network Analytics');

    // Check for description
    await expect(
      page.locator('text=/network activity and performance/i'),
    ).toBeVisible();
  });

  test('analytics page shows stats cards', async ({ page }) => {
    await page.goto('/#/analytics');

    // Wait for stats to load
    await expect(page.locator('text=Total Blocks')).toBeVisible({
      timeout: 30000,
    });

    // Check for other stats
    await expect(page.locator('text=Total Transactions')).toBeVisible();
    await expect(page.locator('text=zkApp Commands').first()).toBeVisible();
    await expect(page.locator('text=Avg Block Time')).toBeVisible();
    await expect(page.locator('text=TPS')).toBeVisible();
    await expect(page.locator('text=Avg Fee')).toBeVisible();
  });

  test('analytics page shows period selector', async ({ page }) => {
    await page.goto('/#/analytics');

    // Wait for page to load
    await expect(page.locator('text=Period:')).toBeVisible({ timeout: 15000 });

    // Check for period buttons
    await expect(
      page.locator('button').filter({ hasText: 'Last 24 hours' }),
    ).toBeVisible();
    await expect(
      page.locator('button').filter({ hasText: 'Last 7 days' }),
    ).toBeVisible();
    await expect(
      page.locator('button').filter({ hasText: 'Last 30 days' }),
    ).toBeVisible();
  });

  test('analytics page shows charts', async ({ page }) => {
    await page.goto('/#/analytics');

    // Wait for charts to load
    await expect(page.locator('text=Block Production')).toBeVisible({
      timeout: 30000,
    });

    // Check for chart sections
    await expect(page.locator('text=Transaction Volume')).toBeVisible();
    await expect(page.locator('text=Average Block Time')).toBeVisible();
    await expect(page.locator('text=Daily Summary')).toBeVisible();
  });

  test('analytics page navigation link works', async ({ page }) => {
    await page.goto('/');

    // Click analytics link in navigation
    await page
      .locator('nav a')
      .filter({ hasText: 'Analytics' })
      .first()
      .click();

    // Should navigate to analytics page
    await expect(page).toHaveURL(/\/analytics/);
    await expect(page.locator('h1')).toContainText('Network Analytics');
  });

  test('analytics period selector changes data', async ({ page }) => {
    await page.goto('/#/analytics');

    // Wait for initial load
    await expect(page.locator('text=Total Blocks')).toBeVisible({
      timeout: 30000,
    });

    // Click on "Last 24 hours"
    await page.locator('button').filter({ hasText: 'Last 24 hours' }).click();

    // Wait for data to reload - stats should still be visible
    await expect(page.locator('text=Total Blocks')).toBeVisible({
      timeout: 30000,
    });
  });
});

test.describe('Transactions Page', () => {
  test('shows confirmed transactions by default', async ({ page }) => {
    await page.goto('/#/transactions');

    // Page title
    await expect(page.locator('h1')).toContainText('Transactions');

    // Confirmed tab should be active
    const confirmedTab = page
      .locator('button')
      .filter({ hasText: 'Confirmed' });
    await expect(confirmedTab).toBeVisible();

    // Should show transaction table
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Table should have expected columns
    await expect(page.locator('th:has-text("Type")')).toBeVisible();
    await expect(page.locator('th:has-text("Hash")')).toBeVisible();
    await expect(page.locator('th:has-text("From")')).toBeVisible();
    await expect(page.locator('th:has-text("Block")')).toBeVisible();
  });

  test('confirmed tab shows transaction rows', async ({ page }) => {
    await page.goto('/#/transactions');

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Should have at least one transaction row
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
  });

  test('can switch to mempool tab', async ({ page }) => {
    await page.goto('/#/transactions');

    // Click mempool tab
    await page.locator('button').filter({ hasText: 'Mempool' }).click();

    // Should show mempool sub-tabs
    await expect(
      page.locator('button').filter({ hasText: /User Transactions/ }),
    ).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator('button').filter({ hasText: /zkApp Commands/ }),
    ).toBeVisible();
  });

  test('can switch between tabs', async ({ page }) => {
    await page.goto('/#/transactions');

    // Wait for confirmed tab to load
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Switch to mempool
    await page.locator('button').filter({ hasText: 'Mempool' }).click();
    await expect(
      page.locator('button').filter({ hasText: /User Transactions/ }),
    ).toBeVisible({
      timeout: 15000,
    });

    // Switch back to confirmed
    await page.locator('button').filter({ hasText: 'Confirmed' }).click();
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
  });

  test('shows type badges for transactions', async ({ page }) => {
    await page.goto('/#/transactions');

    // Wait for table to load
    await expect(page.locator('tbody tr').first()).toBeVisible({
      timeout: 15000,
    });

    // Should show payment or delegation type badges
    const typeBadge = page.locator('tbody span').filter({
      hasText: /payment|delegation|zkapp/i,
    });
    await expect(typeBadge.first()).toBeVisible();
  });

  test('transactions page navigation link works', async ({ page }) => {
    await page.goto('/');

    // Click transactions link in navigation
    await page
      .locator('nav a')
      .filter({ hasText: 'Transactions' })
      .first()
      .click();

    // Should navigate to transactions page
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.locator('h1')).toContainText('Transactions');
  });
});

test.describe('Mobile Menu', () => {
  // Hamburger button is the lg:hidden button in the header
  const hamburger = '[data-testid="mobile-menu-button"]';

  test('network selector is accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Wait for page to load
    await expect(page.locator('text=Block Height').first()).toBeVisible({
      timeout: 15000,
    });

    // Hamburger should be visible on mobile
    await expect(page.locator(hamburger)).toBeVisible({ timeout: 5000 });

    // Open mobile menu
    await page.locator(hamburger).click();

    // Wait for menu animation
    await page.waitForTimeout(300);

    // Network selector button should be visible in mobile menu
    const networkButton = page.locator(
      '[data-testid="mobile-network-selector"]',
    );
    await expect(networkButton).toBeVisible({ timeout: 5000 });

    // Click to expand network list
    await networkButton.click();

    // Network options should be visible inline (not clipped)
    await expect(
      page.locator('button').filter({ hasText: 'Devnet' }).first(),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('button').filter({ hasText: 'Mainnet' }).first(),
    ).toBeVisible();
  });

  test('can switch network on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Wait for page to load
    await expect(page.locator('text=Block Height').first()).toBeVisible({
      timeout: 15000,
    });

    // Open mobile menu
    await expect(page.locator(hamburger)).toBeVisible({ timeout: 5000 });
    await page.locator(hamburger).click();
    await page.waitForTimeout(300);

    // Open network selector
    const networkButton = page.locator(
      '[data-testid="mobile-network-selector"]',
    );
    await networkButton.click();

    // Switch to Devnet
    await page.locator('button').filter({ hasText: 'Devnet' }).first().click();

    // Verify Devnet is now selected
    await expect(networkButton).toContainText('Devnet', { timeout: 5000 });
  });
});
