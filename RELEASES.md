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

The build hard-codes `base: '/mina-explorer/'` in `vite.config.ts` so it matches the GitHub Pages subdirectory. To self-host you have two options:

1. **Serve under `/mina-explorer/`** (simplest). Example nginx:

   ```nginx
   location /mina-explorer/ {
     alias /var/www/mina-explorer/;
     try_files $uri $uri/ /mina-explorer/index.html;
   }
   ```

2. **Rebuild from source** with a different base — clone the repo, edit `vite.config.ts` (`base: '/'`), `npx vite build`, serve the resulting `dist/` at root. Slightly more work but lets you serve the explorer directly at `/`.

A pre-built Docker image is a planned future enhancement; it isn't shipped today because the hard-coded base path would need a second build configuration.

## Slack notifications

Each release posts a short announcement to `#platform-eng-team` with the `@platform-eng-all` mention. Channel and mention are the same ones used by the Grafana alerting setup in `gitops-infrastructure`.

The bot token can be sourced two ways and the workflow accepts either:

- **Path A (preferred):** the token is fetched at workflow runtime from the GCP secret `projects/o1labs-192920/secrets/slackGrafanaAlertsBotToken`, via a least-privilege service account whose JSON key is stored in the GitHub repo secret `GCP_SLACK_TOKEN_SA_KEY`. Token rotation in GCP propagates automatically.
- **Path B (fallback):** the token is copied once into the GitHub repo secret `SLACK_BOT_TOKEN`. Simpler, but rotation no longer propagates automatically — re-run the manual copy step when the GCP secret is rotated.

If neither secret is set, the release ships without sending a Slack notification.

## CODEOWNERS

Changes to `.github/workflows/deploy.yml`, `.github/release.yml`, `.github/CODEOWNERS`, and `RELEASES.md` require approval from a member of `@o1-labs/eng` or one of: @sanabriarusso, @amc-ie, @dkijania, @georgeeee. This gate exists so a stray PR can't accidentally change how releases are cut, signed, or announced.

The CODEOWNERS file is only enforced when branch protection on `main` has **"Require review from Code Owners"** enabled in repo settings.
