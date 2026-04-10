# Releases

`mina-explorer` cuts a release on **every push to `main`** and on **every manual run of the Deploy workflow**. Each release ships:

- a semver-bumped git tag
- a categorized changelog (Features / Bug Fixes / Other)
- a 2–3 sentence AI-written summary at the top of the release notes
- a downloadable build of the explorer (`mina-explorer-<tag>.tar.gz`)
- a Slack announcement to `#platform-eng-team`

## Versioning — automatic semver from commit prefixes

The release workflow walks the commits between the last semver tag and `HEAD` and picks the bump from the highest-precedence prefix it finds:

| Prefix in any commit                                       | Bump  | Example             |
| ---------------------------------------------------------- | ----- | ------------------- |
| `feat!:` / `fix!:` / any `(type)!:` / `BREAKING CHANGE`    | major | `v0.1.0` → `v1.0.0` |
| `feat:` or `feat(scope):`                                  | minor | `v0.1.0` → `v0.2.0` |
| `fix:` or `fix(scope):`                                    | patch | `v0.1.0` → `v0.1.1` |
| anything else (e.g. `chore:`, `docs:`, no prefix)          | patch | `v0.1.0` → `v0.1.1` |

If `HEAD` is already at the last release tag (no new commits) the release job exits cleanly without creating a duplicate tag.

### Conventions

- Use the prefix in the **PR title and squashed commit subject**, lower-case.
- Optional scope in parens: `feat(blocks): paginate detail view`.
- Use `!:` (e.g. `feat!:`, `fix(api)!:`) **or** include `BREAKING CHANGE` in the commit body for any user-visible breaking change.
- The bump rule is intentionally permissive — pushes without any conventional prefix still produce a `patch` release. The fallback exists so trivial commits don't silently disappear from the release timeline.

### Skipping a release for a particular push

Include `[skip release]` anywhere in the head commit message. The deploy still runs; the release job exits early.

### Manual release / milestone tag

Go to **Actions → Deploy to GitHub Pages → Run workflow** and fill in:

- `tag` — optional, e.g. `v1.0.0`. Overrides the auto-bump entirely.
- `prerelease` — optional, marks the release as prerelease.
- `skip_release` — optional, deploy only, no release.

## What's in each release

- **Tag** — `vMAJOR.MINOR.PATCH` (or whatever you passed to `tag`).
- **Title** — the tag.
- **Body** — AI-written 2–3 sentence summary, then a categorized changelog grouped as **Features / Bug Fixes / Other**, then a "Full Changelog" link to the GitHub diff view.
- **Asset: `mina-explorer-<tag>.tar.gz`** — the production build of the explorer (`dist/`), ready to serve.
- **Source code (zip + tar.gz)** — auto-attached by GitHub for users who want to build from source.

## Self-hosting

The explorer is a static SPA — any webserver works.

```bash
TAG=v0.2.0
curl -L -O https://github.com/o1-labs/mina-explorer/releases/download/${TAG}/mina-explorer-${TAG}.tar.gz
mkdir mina-explorer && tar -xzf mina-explorer-${TAG}.tar.gz -C mina-explorer
# serve under /mina-explorer/ — see "Base path" below
```

### Base path

The default build sets `base: '/mina-explorer/'` in `vite.config.ts` to match the GitHub Pages subdirectory. The base is now env-driven via `VITE_BASE_PATH` — pass `VITE_BASE_PATH=/` at build time to serve the explorer at the root instead. To self-host you have three options:

1. **Use the container image** (simplest — see "Container image" below). The image is built with `VITE_BASE_PATH=/` so it serves at `http://host:8080/` directly.

2. **Serve the tarball under `/mina-explorer/`**. Example nginx:

   ```nginx
   location /mina-explorer/ {
     alias /var/www/mina-explorer/;
     try_files $uri $uri/ /mina-explorer/index.html;
   }
   ```

3. **Rebuild the tarball with a different base** — clone the repo and run `VITE_BASE_PATH=/ npx vite build`, then serve `dist/` at root.

## Container image

A pre-built OCI image is published to GitHub Container Registry on every release:

```
ghcr.io/o1-labs/mina-explorer:<version>
ghcr.io/o1-labs/mina-explorer:latest
```

Initial releases ship `linux/amd64` only. `linux/arm64` is supported by the build pipeline and will be enabled by flipping the `PLATFORMS` env var in `.github/workflows/docker.yml` once v1 is validated in production.

### Pull and run

```bash
docker run --rm -p 8080:8080 ghcr.io/o1-labs/mina-explorer:latest
# or
podman run --rm -p 8080:8080 ghcr.io/o1-labs/mina-explorer:latest
```

The image listens on port 8080 (rootless-friendly — runs as the unprivileged nginx user UID 101). It's based on `nginxinc/nginx-unprivileged:1.27-alpine`.

### Runtime configuration

The explorer's network endpoints are baked in at build time. To override them without rebuilding, set these env vars on the container:

| Env var                          | Type        | Purpose |
| -------------------------------- | ----------- | ------- |
| `MINA_EXPLORER_DEFAULT_NETWORK`  | string      | Network id (e.g. `mainnet`). Must match a known id (compiled-in or one you add via `MINA_EXPLORER_NETWORKS`). Validated against `[a-zA-Z0-9_-]+`. |
| `MINA_EXPLORER_NETWORKS`         | JSON object | Map of `id → Partial<NetworkConfig>`, merged over the compiled defaults. Validated as JSON before being embedded. |

The container's entrypoint hook (`docker/entrypoint.sh`) regenerates `/usr/share/nginx/html/config.js` from these vars at startup. If neither is set, the bundled placeholder is left alone and the explorer uses its compiled defaults — image behaves identically to the GitHub Pages build.

To override an existing network's endpoints (only the fields you want to change need to be set):

```bash
docker run --rm -p 8080:8080 \
  -e MINA_EXPLORER_DEFAULT_NETWORK=mainnet \
  -e MINA_EXPLORER_NETWORKS='{"mainnet":{"archiveEndpoint":"https://my-archive.example.com","daemonEndpoint":"https://my-daemon.example.com/graphql"}}' \
  ghcr.io/o1-labs/mina-explorer:latest
```

To add a brand-new network, include `archiveEndpoint` and `daemonEndpoint` at minimum:

```bash
docker run --rm -p 8080:8080 \
  -e MINA_EXPLORER_DEFAULT_NETWORK=my-testnet \
  -e MINA_EXPLORER_NETWORKS='{"my-testnet":{"displayName":"My Testnet","archiveEndpoint":"https://testnet-archive.example.com","daemonEndpoint":"https://testnet-daemon.example.com/graphql","isTestnet":true}}' \
  ghcr.io/o1-labs/mina-explorer:latest
```

Invalid JSON or invalid identifiers cause the entrypoint to abort before nginx starts — fail-fast, with a clear error message in `docker logs`.

### docker-compose / podman-compose

The repo ships [`compose.yaml`](compose.yaml) as a single-service example. The image is overridable via the `MINA_EXPLORER_IMAGE` env var so you can run a locally-built image without editing the compose file:

```bash
# Default — pulls from GHCR
docker compose up -d

# Use a locally-built image
./scripts/docker-build.sh
MINA_EXPLORER_IMAGE=localhost/mina-explorer:dev docker compose up -d

# Or have compose itself build the image — uncomment the `build:` block in
# compose.yaml, then:
docker compose up -d --build
```

The same `MINA_EXPLORER_DEFAULT_NETWORK` and `MINA_EXPLORER_NETWORKS` vars work in compose's `environment:` block — see the commented example at the bottom of `compose.yaml`.

### Build the image yourself

The image is built by [`scripts/docker-build.sh`](scripts/docker-build.sh), which CI invokes with the same env vars you can set yourself:

```bash
# Defaults: docker, host arch, tagged localhost/mina-explorer:dev
./scripts/docker-build.sh

# Build with podman
RUNTIME=podman ./scripts/docker-build.sh

# Multi-arch push to your own GHCR namespace
RUNTIME=docker IMAGE=ghcr.io/myuser/mina-explorer TAGS=v0.2.1,latest \
  PLATFORMS=linux/amd64,linux/arm64 PUSH=1 ./scripts/docker-build.sh

# Customise the SPA base path (e.g. behind a /explorer/ reverse proxy)
VITE_BASE_PATH=/explorer/ ./scripts/docker-build.sh
```

[`scripts/docker-test.sh`](scripts/docker-test.sh) runs HTTP smoke tests, runtime override, validation failure paths, and a compose round-trip against the built image. CI runs it before publishing; locally:

```bash
./scripts/docker-test.sh                  # build + test
RUNTIME=podman ./scripts/docker-test.sh   # with podman
SKIP_BUILD=1 ./scripts/docker-test.sh     # test an existing image
```

## Slack notifications

Each release posts a short announcement to `#platform-eng-team` with the `@platform-eng-all` mention. Channel and mention are the same ones used by the Grafana alerting setup in `gitops-infrastructure`.

The bot token can be sourced two ways and the workflow accepts either:

- **Path A (preferred):** the token is fetched at workflow runtime from the GCP secret `projects/o1labs-192920/secrets/slackGrafanaAlertsBotToken`, via a least-privilege service account whose JSON key is stored in the GitHub repo secret `GCP_SLACK_TOKEN_SA_KEY`. Token rotation in GCP propagates automatically.
- **Path B (fallback):** the token is copied once into the GitHub repo secret `SLACK_BOT_TOKEN`. Simpler, but rotation no longer propagates automatically — re-run the manual copy step when the GCP secret is rotated.

If neither secret is set, the release ships without sending a Slack notification.

## CODEOWNERS

Changes to `.github/workflows/deploy.yml`, `.github/release.yml`, `.github/CODEOWNERS`, and `RELEASES.md` require approval from a member of `@o1-labs/eng` or one of: @sanabriarusso, @amc-ie, @dkijania, @georgeeee. This gate exists so a stray PR can't accidentally change how releases are cut, signed, or announced.

The CODEOWNERS file is only enforced when branch protection on `main` has **"Require review from Code Owners"** enabled in repo settings.
