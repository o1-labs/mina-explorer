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

## Run with Docker / Podman

A pre-built container image is published to GitHub Container Registry on every release: `ghcr.io/o1-labs/mina-explorer`. The image is `linux/amd64` and serves the explorer at `http://localhost:8080/`.

### Quickstart

```bash
docker run --rm -p 8080:8080 ghcr.io/o1-labs/mina-explorer:latest
# or
podman run --rm -p 8080:8080 ghcr.io/o1-labs/mina-explorer:latest
```

Open <http://localhost:8080>.

### Override the network endpoints at runtime

The compiled-in defaults point at the four o1-labs networks (mainnet, devnet, mesa, pre-mesa). To self-host against your own archive node, set `MINA_EXPLORER_NETWORKS` (a JSON object merged over the defaults) and optionally `MINA_EXPLORER_DEFAULT_NETWORK`:

```bash
docker run --rm -p 8080:8080 \
  -e MINA_EXPLORER_DEFAULT_NETWORK=mainnet \
  -e MINA_EXPLORER_NETWORKS='{"mainnet":{"archiveEndpoint":"https://my-archive.example.com","daemonEndpoint":"https://my-daemon.example.com/graphql"}}' \
  ghcr.io/o1-labs/mina-explorer:latest
```

You only need to set the fields you want to change — partial overrides are merged over the compiled-in network entry. To add a brand-new network, include `archiveEndpoint` and `daemonEndpoint` at minimum. See [`RELEASES.md`](RELEASES.md#runtime-configuration) for the full env var spec.

### docker-compose / podman-compose

The repo ships a [`compose.yaml`](compose.yaml) example. Bring it up with whichever compose runtime you have:

```bash
docker compose up -d           # Docker
podman-compose up -d           # Podman
```

The example file shows the same `MINA_EXPLORER_*` env vars in a commented-out `environment:` block — uncomment what you need.

### Build the image locally

The build is driven by [`scripts/docker-build.sh`](scripts/docker-build.sh), which CI invokes with the same env vars you can set yourself. Builds for the host arch by default with the runtime of your choice:

```bash
# Default — docker, host arch, tagged localhost/mina-explorer:dev
./scripts/docker-build.sh

# Use podman
RUNTIME=podman ./scripts/docker-build.sh

# Build for a specific platform
PLATFORMS=linux/arm64 ./scripts/docker-build.sh

# Push a versioned multi-arch tag to your own GHCR namespace
RUNTIME=docker IMAGE=ghcr.io/myuser/mina-explorer TAGS=v0.2.1,latest \
  PLATFORMS=linux/amd64,linux/arm64 PUSH=1 ./scripts/docker-build.sh
```

To run the locally-built image with the compose example, override the image tag via env var:

```bash
./scripts/docker-build.sh
MINA_EXPLORER_IMAGE=localhost/mina-explorer:dev docker compose up -d
```

### Test the image

[`scripts/docker-test.sh`](scripts/docker-test.sh) runs HTTP smoke tests, the runtime-config override path, validation failure paths, and a compose round-trip. CI runs this before publishing; locally run it to validate any change to the image:

```bash
./scripts/docker-test.sh                  # build + test
RUNTIME=podman ./scripts/docker-test.sh   # with podman
SKIP_BUILD=1 ./scripts/docker-test.sh     # test an already-built image
```

## Contributing

1. Create a branch from `main`
2. Make changes, ensure `npx tsc --noEmit` and `npx prettier --check` pass
3. Run `MOCK_API=true npx playwright test` to verify e2e tests
4. Open a PR — CI runs automatically

## License

MIT
