# Mina Explorer

A blockchain explorer for the [Mina Protocol](https://minaprotocol.com) network. Browse blocks, transactions, accounts, staking, zkApps, and network analytics across mainnet, devnet, mesa, and pre-mesa.

**Live:** [o1-labs.github.io/mina-explorer](https://o1-labs.github.io/mina-explorer/)

> **Notice:** This explorer is backed by staging and development infrastructure endpoints with no SLA guarantees. These endpoints may experience downtime, data inconsistencies, or breaking changes without notice. Usage in production applications is not recommended.

## Features

- **Blocks** — paginated block listing with full history, block detail with user commands, zkApp commands, and fee transfers
- **Transactions** — confirmed transactions with server-side pagination, mempool pending transactions and zkApp commands
- **Accounts** — balance, delegation info, and transaction history
- **Staking** — block producer rankings by time period
- **zkApps** — recent zkApp command activity
- **Analytics** — network stats, block production, transaction volume, and daily summaries
- **Multi-network** — switch between mainnet, devnet, mesa, and pre-mesa with a single click
- **Search** — look up blocks (by height or state hash), transactions, and accounts
- **Dark mode** — system-aware with manual toggle
- **Mobile responsive** — full functionality on all viewport sizes

## Quick Start

```bash
npm install
npx vite              # dev server on http://localhost:5173/mina-explorer/
```

## Commands

```bash
npx vite              # dev server
npx vite build        # production build to dist/
npx tsc --noEmit      # type check
npx prettier --check 'src/**/*.{ts,tsx}'   # format check
npx prettier --write 'src/**/*.{ts,tsx}'   # format fix
MOCK_API=true npx playwright test          # e2e tests (mocked)
npx playwright test                        # e2e tests (live endpoints)
```

## Architecture

```
                    ┌─────────────┐
                    │  React App  │
                    │ (HashRouter)│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼──────┐ ┌───▼────┐ ┌─────▼──────┐
        │  Archive   │ │ Daemon │ │ CoinGecko  │
        │  Node API  │ │  Node  │ │  Price API │
        └────────────┘ └────────┘ └────────────┘
```

### Data sources

| Source | What it provides | History depth |
|--------|-----------------|---------------|
| **Archive Node API** | Block listing, pagination, network state, confirmed transactions | Full history |
| **Daemon Node** | Account data, mempool, epoch/slot info, transaction fallback | ~290 recent blocks |
| **CoinGecko** | MINA price and 24h change | Real-time |

The archive provides full block history with transaction data (requires [Archive-Node-API](https://github.com/o1-labs/Archive-Node-API/pull/148) with `ENABLE_BLOCK_TRANSACTION_DETAILS`). The daemon serves as fallback for networks where the archive extension isn't deployed.

### Project structure

```
src/
├── config/networks.ts       # Network definitions (endpoints, display names)
├── context/                  # ThemeContext, NetworkContext (GraphQL client)
├── services/api/
│   ├── client.ts             # Archive node GraphQL client
│   ├── daemon.ts             # Daemon node queries (epoch, bestChain, block)
│   ├── blocks.ts             # Block listing, detail, pagination
│   ├── transactions.ts       # Confirmed + pending transactions
│   ├── accounts.ts           # Account data
│   └── analytics.ts          # Network analytics
├── hooks/                    # React hooks wrapping API calls
├── pages/                    # Route handlers (one per page)
├── components/
│   ├── common/               # Header, Footer, SearchBar, HashLink, etc.
│   ├── blocks/               # BlockList, BlockDetail
│   ├── transactions/         # TransactionList
│   ├── accounts/             # AccountDetail, AccountTransactions
│   └── dashboard/            # NetworkStats, RecentBlocks
├── types/                    # TypeScript types
└── utils/
    ├── formatters.ts         # Nanomina conversion, hash truncation, memo decoding
    └── pagination.ts         # Shared pagination utilities
```

### Network endpoints

| Network | Archive | Daemon |
|---------|---------|--------|
| **Mainnet** | `archive-node-api.gcp.o1test.net` | `mainnet-plain-1.gcp.o1test.net/graphql` |
| **Devnet** | `devnet-archive-node-api.gcp.o1test.net` | `devnet-plain-1.gcp.o1test.net/graphql` |
| **Mesa** | `mesa-archive-node-api.gcp.o1test.net` | `plain-1-graphql.mina-mesa-network.gcp.o1test.net/graphql` |
| **Pre-Mesa** | `pre-mesa-archive-node-api.gcp.o1test.net` | `plain-1-graphql.hetzner-pre-mesa-1.gcp.o1test.net/graphql` |

## Tech Stack

- **React 19** + **TypeScript** (strict mode)
- **Vite** — build tool and dev server
- **Tailwind CSS v4** — styling with CSS custom properties for theming
- **React Router** — hash-based routing for GitHub Pages compatibility
- **Playwright** — e2e testing (Chromium)

## Testing

E2e tests live in `e2e/` and can run against mocked or live endpoints:

```bash
# Mocked (CI default) — uses fixture data, no network required
MOCK_API=true npx playwright test

# Live — hits real archive/daemon endpoints
npx playwright test

# Single test
npx playwright test e2e/explorer.spec.ts -g "test name pattern"

# Against deployed site
TEST_DEPLOYED=true npx playwright test
```

## Releases & Deployment

Every push to `main` builds the explorer, deploys it to GitHub Pages, cuts a semver-bumped GitHub release with a downloadable build artifact, and posts an announcement to `#platform-eng-team`. The release tag is auto-bumped from conventional-commit prefixes (`feat:` → minor, `fix:` → patch, `feat!:` → major).

To trigger a release manually or override the auto-tag, use **Actions → Deploy to GitHub Pages → Run workflow**. To skip a release on a particular push, include `[skip release]` in the commit message.

See [`RELEASES.md`](RELEASES.md) for the full reference (commit prefix rules, self-hosting, manual override, Slack setup, CODEOWNERS gate).

## Contributing

1. Create a branch from `main`
2. Make changes, ensure `npx tsc --noEmit` and `npx prettier --check` pass
3. Run `MOCK_API=true npx playwright test` to verify e2e tests
4. Open a PR — CI runs automatically

## License

MIT
