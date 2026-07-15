import { ApiError, type GraphQLClient } from './client';

// ---------------------------------------------------------------------------
// Best-chain filtering (issues #86 / #97)
//
// The archive marks every block's chain status (canonical/pending/orphaned)
// server-side and exposes it through the `inBestChain` filter on
// BlockQueryInput (verified live against all four networks; the Block type
// itself has no chainStatus field). `inBestChain: true` returns canonical
// blocks plus the pending blocks of the current best chain — excluding
// orphaned fork blocks. Older archive deployments may not know the filter, so
// every filtered query degrades to its unfiltered variant (and the old
// height-based heuristics) instead of breaking the view. This module holds
// the shared support-detection machinery used by the block (#86) and
// transaction (#97) queries.
// ---------------------------------------------------------------------------

// Archive endpoints confirmed to reject the inBestChain filter, so later
// queries skip the filtered attempt instead of paying a failed round trip.
const bestChainFilterUnsupported = new Set<string>();

export function supportsBestChainFilter(client: GraphQLClient): boolean {
  return !bestChainFilterUnsupported.has(client.getEndpoint());
}

// A GraphQL validation error for an unknown filter field names the field, so
// this distinguishes "archive predates inBestChain" from transient failures.
export function isBestChainFilterError(error: unknown): boolean {
  return error instanceof ApiError && error.message.includes('inBestChain');
}

export function markBestChainFilterUnsupported(client: GraphQLClient): void {
  console.log(
    '[API] Archive does not support the inBestChain filter, ' +
      'falling back to height-based canonicality',
  );
  bestChainFilterUnsupported.add(client.getEndpoint());
}
