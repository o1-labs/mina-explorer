// Runtime config placeholder. Shipped as-is in the dev server, the GitHub
// Pages build, and the release tarball — in those contexts the explorer uses
// its compiled-in network defaults.
//
// In the Docker image this file is regenerated at container startup by
// docker/entrypoint.sh from the MINA_EXPLORER_DEFAULT_NETWORK and
// MINA_EXPLORER_NETWORKS env vars. See RELEASES.md for the env var spec.
window.__MINA_EXPLORER_CONFIG__ = {};
