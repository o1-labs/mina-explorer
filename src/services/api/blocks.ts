import { getClient } from './client';
import { queryDaemon, isDaemonUnavailableError } from './daemon';
import type { BlockSummary, BlockDetail, NetworkState } from '@/types';

// Full query with protocolState, networkState, and transaction counts
// Note: feeTransfer is not available in block list queries, only in block detail
const BLOCKS_QUERY_FULL = `
  query GetBlocksFull($limit: Int!) {
    blocks(
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
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
      }
    }
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
      }
    }
  }
`;

// Basic query without protocolState (for Mesa and other nodes)
const BLOCKS_QUERY_BASIC = `
  query GetBlocksBasic($limit: Int!) {
    blocks(
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
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
      }
    }
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
      }
    }
  }
`;

// Minimal query without userCommands/zkappCommands (for mainnet archive)
const BLOCKS_QUERY_MINIMAL = `
  query GetBlocksMinimal($limit: Int!) {
    blocks(
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
      blockHeight
      stateHash
      creator
      dateTime
      transactions {
        coinbase
      }
    }
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
      }
    }
  }
`;

// Paginated query with maxBlockHeight filter
const BLOCKS_QUERY_PAGINATED = `
  query GetBlocksPaginated($limit: Int!, $maxBlockHeight: Int!) {
    blocks(
      query: { blockHeight_lt: $maxBlockHeight }
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
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
      }
    }
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
        pendingMaxBlockHeight
      }
    }
  }
`;

// Minimal paginated query without userCommands/zkappCommands
const BLOCKS_QUERY_PAGINATED_MINIMAL = `
  query GetBlocksPaginatedMinimal($limit: Int!, $maxBlockHeight: Int!) {
    blocks(
      query: { blockHeight_lt: $maxBlockHeight }
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
      blockHeight
      stateHash
      creator
      dateTime
      transactions {
        coinbase
      }
    }
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
        pendingMaxBlockHeight
      }
    }
  }
`;

// Full block detail query with transactions
const BLOCK_DETAIL_QUERY = `
  query GetBlockByHeight($blockHeightGte: Int!, $blockHeightLt: Int!) {
    blocks(
      query: { blockHeight_gte: $blockHeightGte, blockHeight_lt: $blockHeightLt }
      limit: 1
    ) {
      blockHeight
      stateHash
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
          }
        }
        feeTransfer {
          recipient
          fee
          type
        }
      }
    }
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
      }
    }
  }
`;

// Fallback query without full transaction details
const BLOCK_BY_HEIGHT_QUERY = `
  query GetBlockByHeight($blockHeightGte: Int!, $blockHeightLt: Int!) {
    blocks(
      query: { blockHeight_gte: $blockHeightGte, blockHeight_lt: $blockHeightLt }
      limit: 1
    ) {
      blockHeight
      stateHash
      creator
      dateTime
      transactions {
        coinbase
      }
    }
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
      }
    }
  }
`;

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
    };
  };
}

interface BlocksResponse {
  blocks: ApiBlock[];
  networkState: {
    maxBlockHeight: {
      canonicalMaxBlockHeight: number;
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
    canonical: block.blockHeight <= canonicalMaxBlockHeight,
    transactionCount,
    coinbase: block.transactions.coinbase,
    epoch: block.protocolState?.consensusState.epoch,
    slot: block.protocolState?.consensusState.slot,
    slotSinceGenesis: block.protocolState?.consensusState.slotSinceGenesis,
  };
}

function mapApiBlockToDetail(
  block: ApiBlockDetail,
  canonicalMaxBlockHeight: number,
): BlockDetail {
  // Calculate total tx fees from user commands
  const txFees = (block.transactions.userCommands || []).reduce(
    (sum, cmd) => sum + BigInt(cmd.fee || '0'),
    BigInt(0),
  );

  // Calculate snark fees from fee transfers
  const snarkFees = (block.transactions.feeTransfer || [])
    .filter(ft => ft.type === 'Fee_transfer')
    .reduce((sum, ft) => sum + BigInt(ft.fee || '0'), BigInt(0));

  return {
    blockHeight: block.blockHeight,
    stateHash: block.stateHash,
    parentHash: '',
    creator: block.creator,
    creatorAccount: { publicKey: block.creator },
    dateTime: block.dateTime,
    txFees: txFees.toString(),
    snarkFees: snarkFees.toString(),
    canonical: block.blockHeight <= canonicalMaxBlockHeight,
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
          memo: cmd.zkappCommand.memo,
          feePayer: cmd.zkappCommand.feePayer,
          accountUpdates: cmd.zkappCommand.accountUpdates.map(update => ({
            body: {
              publicKey: update.body.publicKey,
              tokenId: update.body.tokenId,
              balanceChange: update.body.balanceChange,
              callDepth: 0,
            },
          })),
        },
        failureReason: cmd.failureReasons?.flatMap(fr => fr.failures) || null,
        dateTime: block.dateTime,
      })),
      feeTransfer: (block.transactions.feeTransfer || []).map(ft => ({
        recipient: ft.recipient,
        fee: ft.fee,
        type: ft.type,
      })),
      coinbase: block.transactions.coinbase,
    },
  };
}

function mapBasicBlockToDetail(
  block: ApiBlock,
  canonicalMaxBlockHeight: number,
): BlockDetail {
  return {
    blockHeight: block.blockHeight,
    stateHash: block.stateHash,
    parentHash: '',
    creator: block.creator,
    creatorAccount: { publicKey: block.creator },
    dateTime: block.dateTime,
    txFees: '0',
    snarkFees: '0',
    canonical: block.blockHeight <= canonicalMaxBlockHeight,
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

export async function fetchBlocks(limit: number = 25): Promise<BlockSummary[]> {
  const client = getClient();

  // Try full query first (with protocolState for epoch/slot info)
  try {
    const data = await client.query<BlocksResponse>(BLOCKS_QUERY_FULL, {
      limit,
    });
    const canonicalMax =
      data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
    return data.blocks.map(block => mapApiBlockToSummary(block, canonicalMax));
  } catch (fullError) {
    // If full query fails, try basic query
    console.log('[API] Full blocks query failed, trying basic query...');
    try {
      const data = await client.query<BlocksResponse>(BLOCKS_QUERY_BASIC, {
        limit,
      });
      const canonicalMax =
        data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
      return data.blocks.map(block =>
        mapApiBlockToSummary(block, canonicalMax),
      );
    } catch (basicError) {
      // If basic query also fails (userCommands/zkappCommands not supported),
      // fall back to minimal query
      console.log('[API] Basic blocks query failed, trying minimal query...');
      const data = await client.query<BlocksResponse>(BLOCKS_QUERY_MINIMAL, {
        limit,
      });
      const canonicalMax =
        data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
      return data.blocks.map(block =>
        mapApiBlockToSummary(block, canonicalMax),
      );
    }
  }
}

interface PaginatedBlocksResponse {
  blocks: ApiBlock[];
  networkState: {
    maxBlockHeight: {
      canonicalMaxBlockHeight: number;
      pendingMaxBlockHeight: number;
    };
  };
}

async function fetchBlocksWithFallback(
  client: ReturnType<typeof getClient>,
  query: string,
  minimalQuery: string,
  variables: Record<string, unknown>,
): Promise<PaginatedBlocksResponse> {
  try {
    return await client.query<PaginatedBlocksResponse>(query, variables);
  } catch (error) {
    // If query fails (userCommands/zkappCommands not supported), use minimal
    console.log('[API] Blocks query failed, trying minimal query...');
    return await client.query<PaginatedBlocksResponse>(minimalQuery, variables);
  }
}

export async function fetchBlocksPaginated(
  limit: number = 25,
  beforeHeight?: number,
): Promise<BlocksPage> {
  const client = getClient();

  // If no cursor, get the latest blocks
  if (!beforeHeight) {
    const data = await fetchBlocksWithFallback(
      client,
      BLOCKS_QUERY_BASIC,
      BLOCKS_QUERY_MINIMAL,
      { limit },
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
  const data = await fetchBlocksWithFallback(
    client,
    BLOCKS_QUERY_PAGINATED,
    BLOCKS_QUERY_PAGINATED_MINIMAL,
    { limit, maxBlockHeight: beforeHeight },
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

async function fetchBlockTransactionsFromDaemon(
  blockHeight: number,
): Promise<BlockDetail['transactions'] | null> {
  const query = `{
    block(height: ${blockHeight}) {
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
          }
        }
        feeTransfer {
          recipient
          fee
          type
        }
      }
    }
  }`;

  try {
    const data = await queryDaemon<DaemonBlockResponse>(query);
    const txs = data.block.transactions;
    return {
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
    };
  } catch (error) {
    if (isDaemonUnavailableError(error)) {
      console.log(
        '[API] Daemon unavailable for block transactions, skipping...',
      );
      return null;
    }
    console.log('[API] Daemon block query failed:', error);
    return null;
  }
}

export async function fetchBlockByHeight(
  blockHeight: number,
): Promise<BlockDetail | null> {
  const client = getClient();

  // Get basic block info from archive (works for all blocks)
  let block: BlockDetail | null = null;
  try {
    const data = await client.query<BlockDetailResponse>(BLOCK_DETAIL_QUERY, {
      blockHeightGte: blockHeight,
      blockHeightLt: blockHeight + 1,
    });
    if (data.blocks.length > 0) {
      const canonicalMax =
        data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
      block = mapApiBlockToDetail(data.blocks[0], canonicalMax);
    }
  } catch {
    try {
      const data = await client.query<BlocksResponse>(BLOCK_BY_HEIGHT_QUERY, {
        blockHeightGte: blockHeight,
        blockHeightLt: blockHeight + 1,
      });
      if (data.blocks.length > 0) {
        const canonicalMax =
          data.networkState.maxBlockHeight.canonicalMaxBlockHeight;
        block = mapBasicBlockToDetail(data.blocks[0], canonicalMax);
      }
    } catch (archiveError) {
      console.log('[API] Archive block query failed:', archiveError);
    }
  }

  if (!block) {
    return null;
  }

  // Try to enrich with transaction data from daemon
  const daemonTxs = await fetchBlockTransactionsFromDaemon(blockHeight);
  if (daemonTxs) {
    block.transactions = daemonTxs;
  }

  return block;
}

export async function fetchBlockByHash(
  stateHash: string,
): Promise<BlockDetail | null> {
  // The API doesn't support querying by stateHash directly
  // We need to search through recent blocks to find the height, then fetch details
  const client = getClient();

  let data: BlocksResponse;
  try {
    data = await client.query<BlocksResponse>(BLOCKS_QUERY_FULL, {
      limit: 100,
    });
  } catch {
    // Fallback to basic query
    try {
      data = await client.query<BlocksResponse>(BLOCKS_QUERY_BASIC, {
        limit: 100,
      });
    } catch {
      // Fallback to minimal query (mainnet doesn't support userCommands/zkappCommands)
      data = await client.query<BlocksResponse>(BLOCKS_QUERY_MINIMAL, {
        limit: 100,
      });
    }
  }

  const block = data.blocks.find(b => b.stateHash === stateHash);
  if (!block) {
    return null;
  }

  // Fetch full block details by height
  return fetchBlockByHeight(block.blockHeight);
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
