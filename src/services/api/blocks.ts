import { getClient, ApiError, type GraphQLClient } from './client';
import { queryDaemon, isDaemonUnavailableError } from './daemon';
import { parseNanomina } from '@/utils/formatters';
import type {
  BlockSummary,
  BlockDetail,
  ChainStatus,
  NetworkState,
} from '@/types';

// ---------------------------------------------------------------------------
// Best-chain filtering (issue #86)
//
// The archive marks every block's chain status (canonical/pending/orphaned)
// server-side and exposes it through the `inBestChain` filter on
// BlockQueryInput (verified live against all four networks; the Block type
// itself has no chainStatus field). `inBestChain: true` returns canonical
// blocks plus the pending blocks of the current best chain — excluding
// orphaned fork blocks. Older archive deployments may not know the filter, so
// every filtered query degrades to its unfiltered variant (and the old
// height-based canonicality heuristic) instead of breaking block listing.
// ---------------------------------------------------------------------------

// Archive endpoints confirmed to reject the inBestChain filter, so later
// queries skip the filtered attempt instead of paying a failed round trip.
const bestChainFilterUnsupported = new Set<string>();

function supportsBestChainFilter(client: GraphQLClient): boolean {
  return !bestChainFilterUnsupported.has(client.getEndpoint());
}

// A GraphQL validation error for an unknown filter field names the field, so
// this distinguishes "archive predates inBestChain" from transient failures.
function isBestChainFilterError(error: unknown): boolean {
  return error instanceof ApiError && error.message.includes('inBestChain');
}

function markBestChainFilterUnsupported(client: GraphQLClient): void {
  console.log(
    '[API] Archive does not support the inBestChain filter, ' +
      'falling back to height-based canonicality',
  );
  bestChainFilterUnsupported.add(client.getEndpoint());
}

// For best-chain blocks the height comparison is exact: everything at or
// below the canonical root is canonical, the rest is pending. For unfiltered
// results (old archives) it remains the historical heuristic.
function heightChainStatus(
  blockHeight: number,
  canonicalMaxBlockHeight: number,
): ChainStatus {
  return blockHeight <= canonicalMaxBlockHeight ? 'canonical' : 'pending';
}

const NETWORK_STATE_FIELDS = `
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
        pendingMaxBlockHeight
      }
    }`;

// Field sets for block list queries. FULL includes protocolState (not
// available on all archives), BASIC adds transaction hashes, MINIMAL is the
// lowest common denominator. Note: feeTransfer is not available in block list
// queries, only in block detail.
type BlockListFieldSet = 'FULL' | 'BASIC' | 'MINIMAL';

const BLOCK_LIST_FIELDS: Record<BlockListFieldSet, string> = {
  FULL: `
      blockHeight
      stateHash
      creator
      dateTime
      protocolState {
        consensusState {
          epoch
          slot
          slotSinceGenesis
        }
      }
      transactions {
        coinbase
        userCommands {
          hash
        }
        zkappCommands {
          hash
        }
      }`,
  BASIC: `
      blockHeight
      stateHash
      creator
      dateTime
      transactions {
        coinbase
        userCommands {
          hash
        }
        zkappCommands {
          hash
        }
      }`,
  MINIMAL: `
      blockHeight
      stateHash
      creator
      dateTime
      transactions {
        coinbase
      }`,
};

function buildBlocksListQuery(
  fieldSet: BlockListFieldSet,
  options: { paginated: boolean; bestChainOnly: boolean },
): string {
  const { paginated, bestChainOnly } = options;
  const params = paginated
    ? '($limit: Int!, $maxBlockHeight: Int!)'
    : '($limit: Int!)';
  const filters = [
    ...(paginated ? ['blockHeight_lt: $maxBlockHeight'] : []),
    ...(bestChainOnly ? ['inBestChain: true'] : []),
  ];
  const queryArg =
    filters.length > 0 ? `query: { ${filters.join(', ')} }\n      ` : '';
  const name = `GetBlocks${fieldSet}${paginated ? 'Paginated' : ''}${
    bestChainOnly ? 'BestChain' : ''
  }`;
  return `
  query ${name}${params} {
    blocks(
      ${queryArg}limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {${BLOCK_LIST_FIELDS[fieldSet]}
    }${NETWORK_STATE_FIELDS}
  }
`;
}

// Field sets for block detail queries. The full variant needs the archive's
// transaction-details extension (and parentHash); the basic variant works on
// archives that haven't been updated yet.
const BLOCK_DETAIL_FIELDS_FULL = `
      blockHeight
      stateHash
      parentHash
      creator
      dateTime
      transactions {
        coinbase
        userCommands {
          hash
          kind
          from
          to
          amount
          fee
          memo
          nonce
          failureReason
        }
        zkappCommands {
          hash
          feePayer
          fee
          memo
          status
          failureReason
        }
        feeTransfer {
          recipient
          fee
          type
        }
      }`;

const BLOCK_DETAIL_FIELDS_BASIC = `
      blockHeight
      stateHash
      creator
      dateTime
      transactions {
        coinbase
      }`;

function buildBlockDetailQuery(
  withTxDetails: boolean,
  bestChainOnly: boolean,
): string {
  const filters = [
    'blockHeight_gte: $blockHeightGte',
    'blockHeight_lt: $blockHeightLt',
    ...(bestChainOnly ? ['inBestChain: true'] : []),
  ];
  const name = `GetBlockByHeight${withTxDetails ? '' : 'Basic'}${
    bestChainOnly ? 'BestChain' : ''
  }`;
  const fields = withTxDetails
    ? BLOCK_DETAIL_FIELDS_FULL
    : BLOCK_DETAIL_FIELDS_BASIC;
  return `
  query ${name}($blockHeightGte: Int!, $blockHeightLt: Int!, $limit: Int!) {
    blocks(
      query: { ${filters.join(', ')} }
      limit: $limit
    ) {${fields}
    }${NETWORK_STATE_FIELDS}
  }
`;
}

const NETWORK_STATE_QUERY = `
  query GetNetworkState {
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
        pendingMaxBlockHeight
      }
    }
  }
`;

interface ApiBlock {
  blockHeight: number;
  stateHash: string;
  creator: string;
  dateTime: string;
  protocolState?: {
    consensusState: {
      epoch: number;
      slot: number;
      slotSinceGenesis: number;
    };
  };
  transactions: {
    coinbase: string;
    userCommands?: Array<{ hash: string }>;
    zkappCommands?: Array<{ hash: string }>;
  };
}

interface ApiBlockDetail {
  blockHeight: number;
  stateHash: string;
  parentHash?: string;
  creator: string;
  dateTime: string;
  transactions: {
    coinbase: string;
    userCommands?: Array<{
      hash: string;
      kind: string;
      from: string;
      to: string;
      amount: string;
      fee: string;
      memo: string;
      nonce: number;
      failureReason: string | null;
    }>;
    zkappCommands?: Array<{
      hash: string;
      feePayer: string;
      fee: string;
      memo: string;
      status: string;
      failureReason: string | null;
    }>;
    feeTransfer?: Array<{
      recipient: string;
      fee: string;
      type: string;
    }>;
  };
}

interface BlockDetailResponse {
  blocks: ApiBlockDetail[];
  networkState: {
    maxBlockHeight: {
      canonicalMaxBlockHeight: number;
      pendingMaxBlockHeight: number;
    };
  };
}

interface BlocksResponse {
  blocks: ApiBlock[];
  networkState: {
    maxBlockHeight: {
      canonicalMaxBlockHeight: number;
      pendingMaxBlockHeight: number;
    };
  };
}

interface NetworkStateResponse {
  networkState: NetworkState;
}

function mapApiBlockToSummary(
  block: ApiBlock,
  canonicalMaxBlockHeight: number,
): BlockSummary {
  // Calculate transaction count (user commands + zkApp commands)
  const userCommandCount = block.transactions.userCommands?.length || 0;
  const zkappCommandCount = block.transactions.zkappCommands?.length || 0;
  const transactionCount = userCommandCount + zkappCommandCount;

  // Note: snarkFees would require feeTransfer data which is only available
  // in block detail queries, not list queries. Set to '0' for now.
  return {
    blockHeight: block.blockHeight,
    stateHash: block.stateHash,
    creator: block.creator,
    dateTime: block.dateTime,
    txFees: '0',
    snarkFees: '0',
    canonical:
      heightChainStatus(block.blockHeight, canonicalMaxBlockHeight) ===
      'canonical',
    transactionCount,
    coinbase: block.transactions.coinbase,
    epoch: block.protocolState?.consensusState.epoch,
    slot: block.protocolState?.consensusState.slot,
    slotSinceGenesis: block.protocolState?.consensusState.slotSinceGenesis,
  };
}

/**
 * Sum a block's fees from its (possibly daemon-enriched) transactions so the
 * summary card always matches the per-transaction tables below it. Transaction
 * fees are the user-command fees plus the zkApp fee-payer fees; snark fees are
 * the standalone `Fee_transfer` entries (not `Fee_transfer_via_coinbase`).
 * BigInt throughout for exactness; parseNanomina tolerates a missing/malformed
 * fee (treats it as 0) so one bad value can't abort the whole block fetch. See
 * issue #70.
 */
function computeBlockFees(transactions: BlockDetail['transactions']): {
  txFees: string;
  snarkFees: string;
} {
  const userFees = (transactions.userCommands || []).reduce(
    (sum, cmd) => sum + (parseNanomina(cmd.fee) ?? 0n),
    0n,
  );
  const zkappFees = (transactions.zkappCommands || []).reduce(
    (sum, cmd) =>
      sum + (parseNanomina(cmd.zkappCommand?.feePayer?.body?.fee) ?? 0n),
    0n,
  );
  const snarkFees = (transactions.feeTransfer || [])
    .filter(ft => ft.type === 'Fee_transfer')
    .reduce((sum, ft) => sum + (parseNanomina(ft.fee) ?? 0n), 0n);

  return {
    txFees: (userFees + zkappFees).toString(),
    snarkFees: snarkFees.toString(),
  };
}

function mapApiBlockToDetail(
  block: ApiBlockDetail,
  canonicalMaxBlockHeight: number,
): BlockDetail {
  const transactions: BlockDetail['transactions'] = {
    userCommands: (block.transactions.userCommands || []).map(cmd => ({
      hash: cmd.hash,
      kind: cmd.kind,
      from: cmd.from,
      to: cmd.to,
      amount: cmd.amount,
      fee: cmd.fee,
      memo: cmd.memo,
      nonce: cmd.nonce,
      failureReason: cmd.failureReason,
      dateTime: block.dateTime,
    })),
    zkappCommands: (block.transactions.zkappCommands || []).map(cmd => ({
      hash: cmd.hash,
      zkappCommand: {
        memo: cmd.memo,
        feePayer: {
          body: {
            publicKey: cmd.feePayer,
            fee: cmd.fee,
          },
        },
        accountUpdates: [],
      },
      failureReason: cmd.failureReason ? [cmd.failureReason] : null,
      dateTime: block.dateTime,
    })),
    feeTransfer: (block.transactions.feeTransfer || []).map(ft => ({
      recipient: ft.recipient,
      fee: ft.fee,
      type: ft.type,
    })),
    coinbase: block.transactions.coinbase,
  };

  // Derive the summary from the mapped transactions so it never contradicts the
  // tables (matters when this block later gets daemon-enriched too).
  const { txFees, snarkFees } = computeBlockFees(transactions);

  // Provisional status from the height heuristic; callers that know the
  // block's true relation to the best chain override it (applyChainStatus).
  const chainStatus = heightChainStatus(
    block.blockHeight,
    canonicalMaxBlockHeight,
  );

  return {
    blockHeight: block.blockHeight,
    stateHash: block.stateHash,
    parentHash: block.parentHash ?? '',
    creator: block.creator,
    creatorAccount: { publicKey: block.creator },
    dateTime: block.dateTime,
    txFees,
    snarkFees,
    canonical: chainStatus === 'canonical',
    chainStatus,
    receivedTime: block.dateTime,
    winnerAccount: { publicKey: block.creator },
    protocolState: {
      consensusState: {
        epoch: 0,
        slot: 0,
        blockHeight: block.blockHeight,
      },
      previousStateHash: block.parentHash ?? '',
    },
    transactions,
  };
}

function mapBasicBlockToDetail(
  block: ApiBlock,
  canonicalMaxBlockHeight: number,
): BlockDetail {
  const chainStatus = heightChainStatus(
    block.blockHeight,
    canonicalMaxBlockHeight,
  );
  return {
    blockHeight: block.blockHeight,
    stateHash: block.stateHash,
    parentHash: '',
    creator: block.creator,
    creatorAccount: { publicKey: block.creator },
    dateTime: block.dateTime,
    txFees: '0',
    snarkFees: '0',
    canonical: chainStatus === 'canonical',
    chainStatus,
    receivedTime: block.dateTime,
    winnerAccount: { publicKey: block.creator },
    protocolState: {
      consensusState: {
        epoch: 0,
        slot: 0,
        blockHeight: block.blockHeight,
      },
      previousStateHash: '',
    },
    transactions: {
      userCommands: [],
      zkappCommands: [],
      feeTransfer: [],
      coinbase: block.transactions.coinbase,
    },
  };
}

export interface BlocksPage {
  blocks: BlockSummary[];
  hasMore: boolean;
  nextCursor: number | null;
  totalBlockHeight: number;
}

// Try each field set in order, first with the best-chain filter (excludes
// orphaned fork blocks), then unfiltered as a degraded fallback for archives
// that predate the filter.
async function fetchBlocksListWithFallback(
  client: GraphQLClient,
  fieldSets: BlockListFieldSet[],
  variables: Record<string, unknown>,
  paginated: boolean,
): Promise<BlocksResponse> {
  let lastError: unknown;
  let filteredError: unknown;

  if (supportsBestChainFilter(client)) {
    for (const fieldSet of fieldSets) {
      try {
        return await client.query<BlocksResponse>(
          buildBlocksListQuery(fieldSet, { paginated, bestChainOnly: true }),
          variables,
        );
      } catch (error) {
        console.log(
          `[API] ${fieldSet} best-chain blocks query failed, trying next variant...`,
        );
        filteredError = error;
        lastError = error;
      }
    }
  }

  for (const fieldSet of fieldSets) {
    try {
      const data = await client.query<BlocksResponse>(
        buildBlocksListQuery(fieldSet, { paginated, bestChainOnly: false }),
        variables,
      );
      // The unfiltered variant worked right after the filtered ones failed on
      // the inBestChain field: this archive predates the filter. Remember
      // that so later queries skip the doomed filtered attempts.
      if (isBestChainFilterError(filteredError)) {
        markBestChainFilterUnsupported(client);
      }
      return data;
    } catch (error) {
      console.log(
        `[API] ${fieldSet} blocks query failed, trying next variant...`,
      );
      lastError = error;
    }
  }
  throw lastError;
}

export async function fetchBlocks(limit: number = 25): Promise<BlockSummary[]> {
  const client = getClient();

  // Try full query first (with protocolState for epoch/slot info), then
  // degrade to basic/minimal field sets for archives with limited schemas.
  const data = await fetchBlocksListWithFallback(
    client,
    ['FULL', 'BASIC', 'MINIMAL'],
    { limit },
    false,
  );
  const canonicalMax = data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
  return data.blocks.map(block => mapApiBlockToSummary(block, canonicalMax));
}

export async function fetchBlocksPaginated(
  limit: number = 25,
  beforeHeight?: number,
): Promise<BlocksPage> {
  const client = getClient();

  // If no cursor, get the latest blocks
  if (!beforeHeight) {
    const data = await fetchBlocksListWithFallback(
      client,
      ['BASIC', 'MINIMAL'],
      { limit },
      false,
    );
    const canonicalMax =
      data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
    const totalHeight = data.networkState.maxBlockHeight.pendingMaxBlockHeight;
    const blocks = data.blocks.map(block =>
      mapApiBlockToSummary(block, canonicalMax),
    );
    const lastBlock = blocks[blocks.length - 1];

    return {
      blocks,
      hasMore: lastBlock ? lastBlock.blockHeight > 1 : false,
      nextCursor: lastBlock ? lastBlock.blockHeight : null,
      totalBlockHeight: totalHeight,
    };
  }

  // Paginated query
  const data = await fetchBlocksListWithFallback(
    client,
    ['BASIC', 'MINIMAL'],
    { limit, maxBlockHeight: beforeHeight },
    true,
  );
  const canonicalMax = data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
  const totalHeight = data.networkState.maxBlockHeight.pendingMaxBlockHeight;
  const blocks = data.blocks.map(block =>
    mapApiBlockToSummary(block, canonicalMax),
  );
  const lastBlock = blocks[blocks.length - 1];

  return {
    blocks,
    hasMore: lastBlock ? lastBlock.blockHeight > 1 : false,
    nextCursor: lastBlock ? lastBlock.blockHeight : null,
    totalBlockHeight: totalHeight,
  };
}

interface DaemonBlockResponse {
  block: {
    stateHash: string;
    dateTime: string;
    protocolState: {
      consensusState: {
        blockHeight: string;
        epoch: string;
        slot: string;
      };
      previousStateHash: string;
    };
    transactions: {
      coinbase: string;
      userCommands: Array<{
        hash: string;
        kind: string;
        from: string;
        to: string;
        amount: string;
        fee: string;
        memo: string;
        nonce: number;
        failureReason: string | null;
      }>;
      zkappCommands: Array<{
        hash: string;
        failureReasons: Array<{ failures: string[] }> | null;
        zkappCommand: {
          memo: string;
          feePayer: {
            body: {
              publicKey: string;
              fee: string;
            };
          };
          accountUpdates: Array<{
            body: {
              publicKey: string;
              tokenId: string;
              balanceChange: {
                magnitude: string;
                sgn: string;
              };
            };
          }>;
        };
      }>;
      feeTransfer: Array<{
        recipient: string;
        fee: string;
        type: string;
      }>;
    };
  };
}

interface DaemonBlockData {
  stateHash: string;
  transactions: BlockDetail['transactions'];
  previousStateHash: string;
}

function buildDaemonBlockQuery(blockHeight: number, full: boolean): string {
  const zkappFields = full
    ? `hash
          failureReasons {
            failures
          }
          zkappCommand {
            memo
            feePayer {
              body {
                publicKey
                fee
              }
            }
            accountUpdates {
              body {
                publicKey
                tokenId
                balanceChange {
                  magnitude
                  sgn
                }
              }
            }
          }`
    : `hash
          zkappCommand {
            memo
            feePayer {
              body {
                publicKey
                fee
              }
            }
            accountUpdates {
              body {
                publicKey
                tokenId
                balanceChange {
                  magnitude
                  sgn
                }
              }
            }
          }`;

  return `{
    block(height: ${blockHeight}) {
      stateHash
      protocolState {
        previousStateHash
      }
      transactions {
        coinbase
        userCommands {
          hash
          kind
          from
          to
          amount
          fee
          memo
          nonce
          failureReason
        }
        zkappCommands {
          ${zkappFields}
        }
        feeTransfer {
          recipient
          fee
          type
        }
      }
    }
  }`;
}

function mapDaemonResponse(data: DaemonBlockResponse): DaemonBlockData {
  const txs = data.block.transactions;
  const previousStateHash = data.block.protocolState?.previousStateHash ?? '';
  return {
    stateHash: data.block.stateHash ?? '',
    previousStateHash,
    transactions: {
      userCommands: (txs.userCommands || []).map(cmd => ({
        hash: cmd.hash,
        kind: cmd.kind,
        from: cmd.from,
        to: cmd.to,
        amount: cmd.amount,
        fee: cmd.fee,
        memo: cmd.memo,
        nonce: cmd.nonce,
        failureReason: cmd.failureReason,
        dateTime: '',
      })),
      zkappCommands: (txs.zkappCommands || []).map(cmd => ({
        hash: cmd.hash,
        zkappCommand: {
          memo: cmd.zkappCommand.memo,
          feePayer: cmd.zkappCommand.feePayer,
          accountUpdates: cmd.zkappCommand.accountUpdates.map(u => ({
            body: {
              publicKey: u.body.publicKey,
              tokenId: u.body.tokenId,
              balanceChange: u.body.balanceChange,
              callDepth: 0,
            },
          })),
        },
        failureReason: cmd.failureReasons?.flatMap(fr => fr.failures) || null,
        dateTime: '',
      })),
      feeTransfer: (txs.feeTransfer || []).map(ft => ({
        recipient: ft.recipient,
        fee: ft.fee,
        type: ft.type,
      })),
      coinbase: txs.coinbase,
    },
  };
}

async function fetchBlockDataFromDaemon(
  blockHeight: number,
): Promise<DaemonBlockData | null> {
  // Try full query first, then fall back to simplified (without failureReasons
  // which some daemon versions don't support on ZkappCommandResult)
  for (const full of [true, false]) {
    try {
      const query = buildDaemonBlockQuery(blockHeight, full);
      const data = await queryDaemon<DaemonBlockResponse>(query);
      return mapDaemonResponse(data);
    } catch (error) {
      if (isDaemonUnavailableError(error)) {
        console.log(
          '[API] Daemon unavailable for block transactions, skipping...',
        );
        return null;
      }
      if (full) {
        console.log(
          '[API] Full daemon block query failed, trying simplified...',
        );
        continue;
      }
      console.log('[API] Daemon block query failed:', error);
      return null;
    }
  }
  return null;
}

// How many same-height blocks to request when disambiguating fork siblings.
// Short-range forks in Mina are shallow, so a handful is plenty.
const SIBLING_FETCH_LIMIT = 10;

function applyChainStatus(
  block: BlockDetail,
  chainStatus: ChainStatus,
): BlockDetail {
  block.chainStatus = chainStatus;
  block.canonical = chainStatus === 'canonical';
  return block;
}

// Fetch the blocks at one height, preferring the full transaction-details
// query and degrading to the basic one for older archives.
async function queryBlocksAtHeight(
  client: GraphQLClient,
  blockHeight: number,
  bestChainOnly: boolean,
  limit: number,
): Promise<{ blocks: BlockDetail[]; canonicalMax: number }> {
  const variables = {
    blockHeightGte: blockHeight,
    blockHeightLt: blockHeight + 1,
    limit,
  };
  try {
    const data = await client.query<BlockDetailResponse>(
      buildBlockDetailQuery(true, bestChainOnly),
      variables,
    );
    const canonicalMax =
      data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
    return {
      blocks: data.blocks.map(b => mapApiBlockToDetail(b, canonicalMax)),
      canonicalMax,
    };
  } catch (error) {
    // A filter error would only repeat on the basic variant; let the caller
    // handle the unfiltered fallback instead.
    if (bestChainOnly && isBestChainFilterError(error)) {
      throw error;
    }
    const data = await client.query<BlocksResponse>(
      buildBlockDetailQuery(false, bestChainOnly),
      variables,
    );
    const canonicalMax =
      data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
    return {
      blocks: data.blocks.map(b => mapBasicBlockToDetail(b, canonicalMax)),
      canonicalMax,
    };
  }
}

// Resolve the block to display at a height. Without expectedStateHash this is
// the best-chain block at that height (never an arbitrary fork sibling); with
// it, the block whose stateHash matches — labeled orphaned when it is not the
// best-chain block. Returns null instead of silently swapping in a sibling.
async function resolveBlockAtHeight(
  client: GraphQLClient,
  blockHeight: number,
  expectedStateHash?: string,
): Promise<BlockDetail | null> {
  if (supportsBestChainFilter(client)) {
    let bestChain: { blocks: BlockDetail[]; canonicalMax: number } | null =
      null;
    try {
      bestChain = await queryBlocksAtHeight(client, blockHeight, true, 1);
    } catch (error) {
      if (!isBestChainFilterError(error)) {
        throw error;
      }
      markBestChainFilterUnsupported(client);
    }

    if (bestChain) {
      const bestBlock = bestChain.blocks[0];
      if (
        bestBlock &&
        (!expectedStateHash || bestBlock.stateHash === expectedStateHash)
      ) {
        return applyChainStatus(
          bestBlock,
          heightChainStatus(bestBlock.blockHeight, bestChain.canonicalMax),
        );
      }
      // Either nothing at this height is in the best chain, or the caller
      // asked for a specific block that isn't: look at all fork siblings.
      const all = await queryBlocksAtHeight(
        client,
        blockHeight,
        false,
        SIBLING_FETCH_LIMIT,
      );
      const match = expectedStateHash
        ? all.blocks.find(b => b.stateHash === expectedStateHash)
        : all.blocks[0];
      return match ? applyChainStatus(match, 'orphaned') : null;
    }
  }

  // Degraded path: the archive predates the inBestChain filter. Keep the old
  // height-heuristic labeling (already applied by the mappers), but still
  // never swap in a sibling with a different hash than the one requested.
  const all = await queryBlocksAtHeight(
    client,
    blockHeight,
    false,
    SIBLING_FETCH_LIMIT,
  );
  const match = expectedStateHash
    ? all.blocks.find(b => b.stateHash === expectedStateHash)
    : all.blocks[0];
  return match ?? null;
}

export async function fetchBlockByHeight(
  blockHeight: number,
  expectedStateHash?: string,
): Promise<BlockDetail | null> {
  const client = getClient();

  let block: BlockDetail | null = null;
  try {
    block = await resolveBlockAtHeight(client, blockHeight, expectedStateHash);
  } catch (archiveError) {
    console.log('[API] Archive block query failed:', archiveError);
  }

  if (!block) {
    return null;
  }

  // Try to enrich with transaction data and parentHash from daemon
  const daemonData = await fetchBlockDataFromDaemon(blockHeight);
  if (daemonData) {
    if (daemonData.stateHash === block.stateHash) {
      block.transactions = daemonData.transactions;
      // Recompute the summary from the enriched tables so a BASIC/MINIMAL
      // archive (no tx-detail extension) no longer shows 0.00 fees above
      // populated tables.
      const { txFees, snarkFees } = computeBlockFees(block.transactions);
      block.txFees = txFees;
      block.snarkFees = snarkFees;
      if (!block.parentHash && daemonData.previousStateHash) {
        block.parentHash = daemonData.previousStateHash;
        block.protocolState.previousStateHash = daemonData.previousStateHash;
      }
    } else {
      // The daemon serves the best-chain block at this height; when the
      // displayed block is a different fork sibling, merging its transactions
      // would present another block's contents as this one's (issue #86).
      console.log(
        '[API] Daemon block stateHash does not match the displayed block, ' +
          'skipping transaction enrichment',
      );
    }
  }

  return block;
}

const BLOCKS_HASH_SEARCH_QUERY = `
  query SearchBlockByHash($limit: Int!) {
    blocks(limit: $limit, sortBy: BLOCKHEIGHT_DESC) {
      blockHeight
      stateHash
    }
  }
`;

const BLOCKS_HASH_SEARCH_QUERY_PAGINATED = `
  query SearchBlockByHashPaginated($limit: Int!, $maxBlockHeight: Int!) {
    blocks(query: { blockHeight_lt: $maxBlockHeight }, limit: $limit, sortBy: BLOCKHEIGHT_DESC) {
      blockHeight
      stateHash
    }
  }
`;

interface HashSearchResponse {
  blocks: Array<{ blockHeight: number; stateHash: string }>;
}

// The archive can't filter blocks by state hash (BlockQueryInput exposes only
// height/date/canonical filters — verified against the live endpoint), so a
// hash lookup scans recent blocks in chunks. BLOCK_HASH_SEARCH_WINDOW is how far
// back (in blocks) a hash stays reachable before the scan gives up; the UI uses
// it to explain that an older, un-found hash may still be a real block.
const BLOCK_HASH_SEARCH_CHUNK = 500;
const BLOCK_HASH_SEARCH_MAX_CHUNKS = 10;
export const BLOCK_HASH_SEARCH_WINDOW =
  BLOCK_HASH_SEARCH_CHUNK * BLOCK_HASH_SEARCH_MAX_CHUNKS;

export async function fetchBlockByHash(
  stateHash: string,
): Promise<BlockDetail | null> {
  const client = getClient();

  let cursor: number | undefined;

  for (let i = 0; i < BLOCK_HASH_SEARCH_MAX_CHUNKS; i++) {
    const query = cursor
      ? BLOCKS_HASH_SEARCH_QUERY_PAGINATED
      : BLOCKS_HASH_SEARCH_QUERY;
    const variables: Record<string, unknown> = {
      limit: BLOCK_HASH_SEARCH_CHUNK,
    };
    if (cursor) {
      variables.maxBlockHeight = cursor;
    }

    const data = await client.query<HashSearchResponse>(query, variables);

    const match = data.blocks.find(b => b.stateHash === stateHash);
    if (match) {
      // Pass the searched hash through so the detail fetch returns this exact
      // block (correctly labeled if orphaned), never a fork sibling at the
      // same height.
      return fetchBlockByHeight(match.blockHeight, stateHash);
    }

    // No more blocks to search
    if (data.blocks.length < BLOCK_HASH_SEARCH_CHUNK) {
      break;
    }

    // Move cursor to oldest block in this chunk
    cursor = data.blocks[data.blocks.length - 1].blockHeight;
  }

  return null;
}

export async function fetchNetworkState(): Promise<NetworkState> {
  const client = getClient();
  const data = await client.query<NetworkStateResponse>(NETWORK_STATE_QUERY);
  return data.networkState;
}

export interface TopBlockProducer {
  publicKey: string;
  blocksProduced: number;
}

const TOP_PRODUCERS_QUERY = `
  query GetTopProducers($limit: Int!) {
    blocks(
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
      creator
    }
  }
`;

interface TopProducersResponse {
  blocks: Array<{ creator: string }>;
}

export async function fetchTopBlockProducers(
  sampleSize: number = 500,
  topN: number = 10,
): Promise<TopBlockProducer[]> {
  const client = getClient();
  const data = await client.query<TopProducersResponse>(TOP_PRODUCERS_QUERY, {
    limit: sampleSize,
  });

  // Count blocks per creator
  const counts = new Map<string, number>();
  for (const block of data.blocks) {
    counts.set(block.creator, (counts.get(block.creator) || 0) + 1);
  }

  // Sort by count and return top N
  const sorted = Array.from(counts.entries())
    .map(([publicKey, blocksProduced]) => ({ publicKey, blocksProduced }))
    .sort((a, b) => b.blocksProduced - a.blocksProduced)
    .slice(0, topN);

  return sorted;
}

// Query blocks by date range for historical analysis
// GraphQL query:
//   query GetBlocksByDateRange($startDate: DateTime!, $endDate: DateTime!, $limit: Int!) {
//     blocks(
//       query: { dateTime_gte: $startDate, dateTime_lt: $endDate }
//       limit: $limit
//       sortBy: BLOCKHEIGHT_DESC
//     ) { creator, blockHeight, dateTime }
//   }
// Note: API uses dateTime_lt (not dateTime_lte)
const BLOCKS_BY_DATE_QUERY = `
  query GetBlocksByDateRange($startDate: DateTime!, $endDate: DateTime!, $limit: Int!) {
    blocks(
      query: { dateTime_gte: $startDate, dateTime_lt: $endDate }
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
      creator
      blockHeight
      dateTime
    }
  }
`;

interface BlocksByDateResponse {
  blocks: Array<{ creator: string; blockHeight: number; dateTime: string }>;
}

export interface TopBlockProducerWithPeriod extends TopBlockProducer {
  firstBlockTime: string;
  lastBlockTime: string;
}

export interface BlockProducersResult {
  producers: TopBlockProducerWithPeriod[];
  totalBlocks: number;
  startDate: string;
  endDate: string;
}

export async function fetchBlockProducersByDateRange(
  startDate: Date,
  endDate: Date,
  topN: number = 25,
): Promise<BlockProducersResult> {
  const client = getClient();

  // Fetch blocks in the date range (limit to 10000 to avoid timeout)
  const data = await client.query<BlocksByDateResponse>(BLOCKS_BY_DATE_QUERY, {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    limit: 10000,
  });

  // Count blocks per creator and track time ranges
  const producerStats = new Map<
    string,
    { count: number; firstBlockTime: string; lastBlockTime: string }
  >();

  for (const block of data.blocks) {
    const existing = producerStats.get(block.creator);
    if (existing) {
      existing.count++;
      // Track earliest and latest block times
      if (block.dateTime < existing.firstBlockTime) {
        existing.firstBlockTime = block.dateTime;
      }
      if (block.dateTime > existing.lastBlockTime) {
        existing.lastBlockTime = block.dateTime;
      }
    } else {
      producerStats.set(block.creator, {
        count: 1,
        firstBlockTime: block.dateTime,
        lastBlockTime: block.dateTime,
      });
    }
  }

  // Sort by count and return top N
  const sorted = Array.from(producerStats.entries())
    .map(([publicKey, stats]) => ({
      publicKey,
      blocksProduced: stats.count,
      firstBlockTime: stats.firstBlockTime,
      lastBlockTime: stats.lastBlockTime,
    }))
    .sort((a, b) => b.blocksProduced - a.blocksProduced)
    .slice(0, topN);

  return {
    producers: sorted,
    totalBlocks: data.blocks.length,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}
