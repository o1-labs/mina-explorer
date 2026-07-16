import { getClient, type GraphQLClient } from './client';
import { queryDaemon, isCorsError, MAX_DAEMON_BLOCKS } from './daemon';
import {
  supportsBestChainFilter,
  isBestChainFilterError,
  markBestChainFilterUnsupported,
} from './bestChainFilter';

export interface PendingTransaction {
  hash: string;
  kind: string;
  amount: string;
  fee: string;
  from: string;
  to: string;
  memo: string;
  nonce: number;
}

export interface PendingZkAppCommand {
  hash: string;
  feePayer: string;
  fee: string;
  memo: string;
}

interface DaemonUserCommandResponse {
  pooledUserCommands: Array<{
    hash: string;
    kind: string;
    amount: string;
    fee: string;
    from: string;
    to: string;
    memo: string;
    nonce: number;
  }>;
}

interface DaemonZkAppCommandResponse {
  pooledZkappCommands: Array<{
    hash: string;
    zkappCommand: {
      memo: string;
      feePayer: {
        body: {
          publicKey: string;
          fee: string;
        };
      };
    };
  }>;
}

const POOLED_USER_COMMANDS_QUERY = `
  query GetPooledUserCommands {
    pooledUserCommands {
      hash
      kind
      amount
      fee
      from
      to
      memo
      nonce
    }
  }
`;

const POOLED_ZKAPP_COMMANDS_QUERY = `
  query GetPooledZkAppCommands {
    pooledZkappCommands {
      hash
      zkappCommand {
        memo
        feePayer {
          body {
            publicKey
            fee
          }
        }
      }
    }
  }
`;

export async function fetchPendingTransactions(): Promise<
  PendingTransaction[]
> {
  try {
    const data = await queryDaemon<DaemonUserCommandResponse>(
      POOLED_USER_COMMANDS_QUERY,
    );
    return data.pooledUserCommands;
  } catch (error) {
    if (isCorsError(error)) {
      throw new Error(
        'Unable to reach daemon endpoint. The Mina daemon does not allow ' +
          'cross-origin requests from this domain.',
      );
    }
    throw error;
  }
}

export async function fetchPendingZkAppCommands(): Promise<
  PendingZkAppCommand[]
> {
  try {
    const data = await queryDaemon<DaemonZkAppCommandResponse>(
      POOLED_ZKAPP_COMMANDS_QUERY,
    );
    return data.pooledZkappCommands.map(cmd => ({
      hash: cmd.hash,
      feePayer: cmd.zkappCommand.feePayer.body.publicKey,
      fee: cmd.zkappCommand.feePayer.body.fee,
      memo: cmd.zkappCommand.memo,
    }));
  } catch (error) {
    if (isCorsError(error)) {
      throw new Error(
        'Unable to reach daemon endpoint. The Mina daemon does not allow ' +
          'cross-origin requests from this domain.',
      );
    }
    throw error;
  }
}

// Transaction detail types
export interface TransactionDetail {
  hash: string;
  type: 'user_command' | 'zkapp_command';
  status: 'pending' | 'confirmed';
  blockHeight?: number;
  blockStateHash?: string;
  dateTime?: string;
  // User command fields
  kind?: string;
  from?: string;
  to?: string;
  amount?: string;
  fee: string;
  memo?: string;
  nonce?: number;
  failureReason?: string | null | undefined;
  // zkApp command fields
  feePayer?: string;
  accountUpdates?: number;
}

// Field sets for the block-scan transaction search. FULL uses the nested
// zkApp schema (daemon-style), FLAT the archive's flat zkApp schema
// (ENABLE_BLOCK_TRANSACTION_DETAILS), BASIC omits zkappCommands entirely.
type SearchQueryTier = 'FULL' | 'FLAT' | 'BASIC';

const SEARCH_USER_COMMAND_FIELDS = `
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
        }`;

const SEARCH_TRANSACTION_FIELDS: Record<SearchQueryTier, string> = {
  FULL: `${SEARCH_USER_COMMAND_FIELDS}
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
              }
            }
          }
        }`,
  FLAT: `${SEARCH_USER_COMMAND_FIELDS}
        zkappCommands {
          hash
          feePayer
          fee
          memo
          status
          failureReason
        }`,
  BASIC: SEARCH_USER_COMMAND_FIELDS,
};

const SEARCH_QUERY_NAMES: Record<SearchQueryTier, string> = {
  FULL: 'SearchTransaction',
  FLAT: 'SearchTransactionFlat',
  BASIC: 'SearchTransactionBasic',
};

// Build a block-scan search query, optionally filtered to the best chain so
// transactions that exist only in orphaned fork blocks are excluded (#97).
function buildSearchTransactionQuery(
  tier: SearchQueryTier,
  bestChainOnly: boolean,
): string {
  const queryArg = bestChainOnly ? 'query: { inBestChain: true }\n      ' : '';
  const name = `${SEARCH_QUERY_NAMES[tier]}${bestChainOnly ? 'BestChain' : ''}`;
  return `
  query ${name}($limit: Int!) {
    blocks(
      ${queryArg}limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
      blockHeight
      stateHash
      dateTime
      transactions {${SEARCH_TRANSACTION_FIELDS[tier]}
      }
    }
  }
`;
}

// Unfiltered variants (also used by the account-history scan; best-chain
// filtering for account history is tracked as a follow-up to #97/#101).
const SEARCH_TRANSACTION_QUERY_FULL = buildSearchTransactionQuery(
  'FULL',
  false,
);
const SEARCH_TRANSACTION_QUERY_FLAT = buildSearchTransactionQuery(
  'FLAT',
  false,
);
const SEARCH_TRANSACTION_QUERY_BASIC = buildSearchTransactionQuery(
  'BASIC',
  false,
);

interface SearchTransactionResponse {
  blocks: Array<{
    blockHeight: number;
    stateHash: string;
    dateTime: string;
    transactions: {
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
            };
          }>;
        };
      }>;
    };
  }>;
}

interface SearchTransactionFlatResponse {
  blocks: Array<{
    blockHeight: number;
    stateHash: string;
    dateTime: string;
    transactions: {
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
        feePayer: string;
        fee: string;
        memo: string;
        status: string;
        failureReason: string | null;
      }>;
    };
  }>;
}

/**
 * Search for a transaction by hash
 * First checks pending pool, then searches confirmed blocks
 */
export async function fetchTransactionByHash(
  hash: string,
): Promise<TransactionDetail | null> {
  // First, try to find in pending transactions
  try {
    const pendingTxs = await fetchPendingTransactions();
    const pendingTx = pendingTxs.find(tx => tx.hash === hash);
    if (pendingTx) {
      return {
        hash: pendingTx.hash,
        type: 'user_command',
        status: 'pending',
        kind: pendingTx.kind,
        from: pendingTx.from,
        to: pendingTx.to,
        amount: pendingTx.amount,
        fee: pendingTx.fee,
        memo: pendingTx.memo,
        nonce: pendingTx.nonce,
      };
    }
  } catch {
    // Daemon might not be available, continue to search archive
  }

  // Try to find in pending zkApp commands
  try {
    const pendingZkApps = await fetchPendingZkAppCommands();
    const pendingZkApp = pendingZkApps.find(tx => tx.hash === hash);
    if (pendingZkApp) {
      return {
        hash: pendingZkApp.hash,
        type: 'zkapp_command',
        status: 'pending',
        feePayer: pendingZkApp.feePayer,
        fee: pendingZkApp.fee,
        memo: pendingZkApp.memo,
      };
    }
  } catch {
    // Daemon might not be available, continue to search archive
  }

  // Search in confirmed blocks (archive node)
  const client = getClient();

  // Helper to search blocks for the transaction
  const searchBlocks = (
    data: SearchTransactionResponse,
  ): TransactionDetail | null => {
    for (const block of data.blocks) {
      // Search in user commands
      const userCmd = block.transactions.userCommands?.find(
        tx => tx.hash === hash,
      );
      if (userCmd) {
        return {
          hash: userCmd.hash,
          type: 'user_command',
          status: 'confirmed',
          blockHeight: block.blockHeight,
          blockStateHash: block.stateHash,
          dateTime: block.dateTime,
          kind: userCmd.kind,
          from: userCmd.from,
          to: userCmd.to,
          amount: userCmd.amount,
          fee: userCmd.fee,
          memo: userCmd.memo,
          nonce: userCmd.nonce,
          failureReason: userCmd.failureReason,
        };
      }

      // Search in zkApp commands (if available)
      const zkAppCmd = block.transactions.zkappCommands?.find(
        tx => tx.hash === hash,
      );
      if (zkAppCmd) {
        return {
          hash: zkAppCmd.hash,
          type: 'zkapp_command',
          status: 'confirmed',
          blockHeight: block.blockHeight,
          blockStateHash: block.stateHash,
          dateTime: block.dateTime,
          feePayer: zkAppCmd.zkappCommand.feePayer.body.publicKey,
          fee: zkAppCmd.zkappCommand.feePayer.body.fee,
          memo: zkAppCmd.zkappCommand.memo,
          accountUpdates: zkAppCmd.zkappCommand.accountUpdates?.length || 0,
          failureReason: zkAppCmd.failureReasons
            ?.flatMap(fr => fr.failures)
            .join(', '),
        };
      }
    }
    return null;
  };

  // Helper to search flat-schema blocks for the transaction
  const searchBlocksFlat = (
    data: SearchTransactionFlatResponse,
  ): TransactionDetail | null => {
    for (const block of data.blocks) {
      const userCmd = block.transactions.userCommands?.find(
        tx => tx.hash === hash,
      );
      if (userCmd) {
        return {
          hash: userCmd.hash,
          type: 'user_command',
          status: 'confirmed',
          blockHeight: block.blockHeight,
          blockStateHash: block.stateHash,
          dateTime: block.dateTime,
          kind: userCmd.kind,
          from: userCmd.from,
          to: userCmd.to,
          amount: userCmd.amount,
          fee: userCmd.fee,
          memo: userCmd.memo,
          nonce: userCmd.nonce,
          failureReason: userCmd.failureReason,
        };
      }

      const zkAppCmd = block.transactions.zkappCommands?.find(
        tx => tx.hash === hash,
      );
      if (zkAppCmd) {
        return {
          hash: zkAppCmd.hash,
          type: 'zkapp_command',
          status: 'confirmed',
          blockHeight: block.blockHeight,
          blockStateHash: block.stateHash,
          dateTime: block.dateTime,
          feePayer: zkAppCmd.feePayer,
          fee: zkAppCmd.fee,
          memo: zkAppCmd.memo,
          failureReason: zkAppCmd.failureReason,
        };
      }
    }
    return null;
  };

  // Fallback chain: nested (daemon) → flat (archive) → basic (no zkApps).
  // With bestChainOnly, a filter validation error aborts the chain (every
  // filtered tier fails identically) so the caller can degrade; any other
  // error falls through to the next tier as before.
  const searchConfirmedBlocks = async (
    bestChainOnly: boolean,
  ): Promise<TransactionDetail | null> => {
    // Try nested query first (works for daemon endpoints)
    try {
      const data = await client.query<SearchTransactionResponse>(
        buildSearchTransactionQuery('FULL', bestChainOnly),
        { limit: 1000 },
      );
      const result = searchBlocks(data);
      if (result) return result;
    } catch (error) {
      if (bestChainOnly && isBestChainFilterError(error)) throw error;
      const errorMessage = error instanceof Error ? error.message : '';
      if (
        errorMessage.includes('zkappCommands') ||
        errorMessage.includes('Cannot query field')
      ) {
        // Nested schema not supported — skip to flat and basic below
      } else {
        console.error('[API] Error searching for transaction:', error);
      }
    }

    // Try flat query (archive with ENABLE_BLOCK_TRANSACTION_DETAILS)
    try {
      const data = await client.query<SearchTransactionFlatResponse>(
        buildSearchTransactionQuery('FLAT', bestChainOnly),
        { limit: 1000 },
      );
      const result = searchBlocksFlat(data);
      if (result) return result;
    } catch (error) {
      if (bestChainOnly && isBestChainFilterError(error)) throw error;
      // Flat query failed — try basic (no zkApp data)
    }

    // Last resort: basic query (no zkappCommands at all)
    try {
      const data = await client.query<SearchTransactionResponse>(
        buildSearchTransactionQuery('BASIC', bestChainOnly),
        { limit: 1000 },
      );
      const result = searchBlocks(data);
      if (result) return result;
    } catch (basicError) {
      if (bestChainOnly && isBestChainFilterError(basicError)) {
        throw basicError;
      }
      console.error('[API] Error with basic transaction search:', basicError);
    }

    return null;
  };

  // Scan best-chain blocks only (#97): a transaction found this way is in the
  // best chain by construction, so its 'confirmed' status cannot be
  // contradicted by an orphaned fork inclusion — and a transaction that only
  // exists in an orphaned block is correctly reported as not found instead of
  // confirmed. Archives that predate the filter degrade to the previous
  // unfiltered scan.
  if (supportsBestChainFilter(client)) {
    try {
      return await searchConfirmedBlocks(true);
    } catch (filterError) {
      if (!isBestChainFilterError(filterError)) throw filterError;
      markBestChainFilterUnsupported(client);
    }
  }
  return searchConfirmedBlocks(false);
}

// The account history only scans this many of the most recent blocks. The
// UI must disclose this window (#89) — exported so the copy stays in sync
// with the actual query limit (mirrors BLOCK_HASH_SEARCH_WINDOW from #73).
export const ACCOUNT_TX_SEARCH_WINDOW = 500;

// Schema errors mean the endpoint doesn't support the query shape (archive
// flat vs daemon nested vs no zkApp support) — the caller should fall through
// to the next query tier. Anything else (timeout, HTTP 5xx, network) is a
// real failure that must surface to the UI.
function isSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return (
    message.includes('zkappCommands') || message.includes('Cannot query field')
  );
}

// Account transaction type for history
export interface AccountTransaction {
  hash: string;
  type: 'sent' | 'received' | 'zkapp';
  kind?: string | undefined;
  counterparty?: string | undefined;
  amount?: string | undefined;
  fee: string;
  blockHeight: number;
  dateTime: string;
  memo?: string | undefined;
  // Non-empty when the command failed on-chain (funds did not move).
  failureReason?: string | null | undefined;
}

/**
 * Fetch transaction history for an account
 * Returns sent and received transactions from the most recent
 * ACCOUNT_TX_SEARCH_WINDOW blocks. Throws when no query tier could produce
 * data, so the UI can show its error state instead of a false empty history.
 */
export async function fetchAccountTransactions(
  publicKey: string,
  limit: number = ACCOUNT_TX_SEARCH_WINDOW,
): Promise<AccountTransaction[]> {
  const client = getClient();
  const transactions: AccountTransaction[] = [];

  // Helper to extract transactions from blocks
  const extractTransactions = (data: SearchTransactionResponse): void => {
    for (const block of data.blocks) {
      // Check user commands
      for (const cmd of block.transactions.userCommands || []) {
        if (cmd.from === publicKey) {
          transactions.push({
            hash: cmd.hash,
            type: 'sent',
            kind: cmd.kind,
            counterparty: cmd.to,
            amount: cmd.amount,
            fee: cmd.fee,
            blockHeight: block.blockHeight,
            dateTime: block.dateTime,
            memo: cmd.memo,
            failureReason: cmd.failureReason,
          });
        } else if (cmd.to === publicKey) {
          transactions.push({
            hash: cmd.hash,
            type: 'received',
            kind: cmd.kind,
            counterparty: cmd.from,
            amount: cmd.amount,
            fee: cmd.fee,
            blockHeight: block.blockHeight,
            dateTime: block.dateTime,
            memo: cmd.memo,
            failureReason: cmd.failureReason,
          });
        }
      }

      // Check zkApp commands (if available)
      for (const cmd of block.transactions.zkappCommands || []) {
        const feePayer = cmd.zkappCommand.feePayer.body.publicKey;
        const affectedAccounts = cmd.zkappCommand.accountUpdates?.map(
          u => u.body.publicKey,
        );

        if (feePayer === publicKey || affectedAccounts?.includes(publicKey)) {
          transactions.push({
            hash: cmd.hash,
            type: 'zkapp',
            counterparty: feePayer === publicKey ? undefined : feePayer,
            fee: cmd.zkappCommand.feePayer.body.fee,
            blockHeight: block.blockHeight,
            dateTime: block.dateTime,
            memo: cmd.zkappCommand.memo,
            failureReason:
              cmd.failureReasons?.flatMap(fr => fr.failures).join(', ') || null,
          });
        }
      }
    }
  };

  // Helper to extract from flat-schema blocks
  const extractTransactionsFlat = (
    data: SearchTransactionFlatResponse,
  ): void => {
    for (const block of data.blocks) {
      for (const cmd of block.transactions.userCommands || []) {
        if (cmd.from === publicKey) {
          transactions.push({
            hash: cmd.hash,
            type: 'sent',
            kind: cmd.kind,
            counterparty: cmd.to,
            amount: cmd.amount,
            fee: cmd.fee,
            blockHeight: block.blockHeight,
            dateTime: block.dateTime,
            memo: cmd.memo,
            failureReason: cmd.failureReason,
          });
        } else if (cmd.to === publicKey) {
          transactions.push({
            hash: cmd.hash,
            type: 'received',
            kind: cmd.kind,
            counterparty: cmd.from,
            amount: cmd.amount,
            fee: cmd.fee,
            blockHeight: block.blockHeight,
            dateTime: block.dateTime,
            memo: cmd.memo,
            failureReason: cmd.failureReason,
          });
        }
      }

      for (const cmd of block.transactions.zkappCommands || []) {
        if (cmd.feePayer === publicKey) {
          transactions.push({
            hash: cmd.hash,
            type: 'zkapp',
            fee: cmd.fee,
            blockHeight: block.blockHeight,
            dateTime: block.dateTime,
            memo: cmd.memo,
            failureReason: cmd.failureReason,
          });
        }
      }
    }
  };

  // Fallback chain: nested (daemon) → flat (archive) → basic (no zkApps).
  // Schema errors ("Cannot query field") fall through to the next tier;
  // any other failure (timeout, HTTP 5xx, network) propagates so the UI
  // shows its error state instead of a false "No transactions found" (#89).
  try {
    const data = await client.query<SearchTransactionResponse>(
      SEARCH_TRANSACTION_QUERY_FULL,
      { limit },
    );
    extractTransactions(data);
  } catch (error) {
    if (!isSchemaError(error)) throw error;

    // Try flat schema
    try {
      const data = await client.query<SearchTransactionFlatResponse>(
        SEARCH_TRANSACTION_QUERY_FLAT,
        { limit },
      );
      extractTransactionsFlat(data);
    } catch (flatError) {
      if (!isSchemaError(flatError)) throw flatError;

      // Last resort: basic query (no zkApp data). If this also fails, no
      // tier produced data — let the error reach the hook.
      const data = await client.query<SearchTransactionResponse>(
        SEARCH_TRANSACTION_QUERY_BASIC,
        { limit },
      );
      extractTransactions(data);
    }
  }

  // The archive `blocks` query includes non-canonical (fork) blocks, so the
  // same transaction can appear in more than one block. Deduplicate by hash,
  // keeping the highest-block instance. Proper canonicality filtering
  // (inBestChain) for transaction queries is tracked in #97.
  const byHash = new Map<string, AccountTransaction>();
  for (const tx of transactions) {
    const existing = byHash.get(tx.hash);
    if (!existing || tx.blockHeight > existing.blockHeight) {
      byHash.set(tx.hash, tx);
    }
  }

  // Sort by block height descending (newest first)
  return [...byHash.values()].sort((a, b) => b.blockHeight - a.blockHeight);
}

// --- Paginated confirmed transactions ---

export interface ConfirmedTransaction {
  hash: string;
  type: 'payment' | 'delegation' | 'zkapp';
  kind?: string;
  from: string;
  to?: string;
  amount?: string;
  fee: string;
  memo?: string;
  nonce?: number;
  blockHeight: number;
  dateTime: string;
  failureReason?: string | null | undefined;
}

export interface TransactionsPageResult {
  transactions: ConfirmedTransaction[];
  hasMore: boolean;
  nextCursor: number | null;
  /** Real chain height (for display) — NOT a measure of pageable data. */
  totalBlockHeight: number;
  /**
   * How many blocks can actually be paged through. Equals the chain height
   * when the archive serves full history; on the daemon fallback it is only
   * the small recent-block window, so page math must use this — never
   * totalBlockHeight — to avoid fabricating pages (#90).
   */
  totalPageableBlocks: number;
  /** Which backend produced this page of results. */
  source: 'archive' | 'daemon-fallback';
}

// Archive queries for confirmed transactions (requires Archive-Node-API PR
// 148+). Filtered variants add `inBestChain: true` so transactions that only
// exist in orphaned fork blocks never appear as confirmed (#97).
const TRANSACTIONS_ARCHIVE_FIELDS = `
      blockHeight
      dateTime
      transactions {
        userCommands {
          hash
          kind
          from
          to
          amount
          fee
          memo
          nonce
          status
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
      }`;

function buildTransactionsArchiveQuery(
  paginated: boolean,
  bestChainOnly: boolean,
): string {
  const params = paginated
    ? '($limit: Int!, $maxBlockHeight: Int!)'
    : '($limit: Int!)';
  const filters = [
    ...(paginated ? ['blockHeight_lt: $maxBlockHeight'] : []),
    ...(bestChainOnly ? ['inBestChain: true'] : []),
  ];
  const queryArg =
    filters.length > 0 ? `query: { ${filters.join(', ')} }\n      ` : '';
  const name = `GetTransactions${paginated ? 'Paginated' : ''}${
    bestChainOnly ? 'BestChain' : ''
  }`;
  return `
  query ${name}${params} {
    blocks(
      ${queryArg}limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {${TRANSACTIONS_ARCHIVE_FIELDS}
    }
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
        pendingMaxBlockHeight
      }
    }
  }
`;
}

interface ArchiveTransactionBlock {
  blockHeight: number;
  dateTime: string;
  transactions: {
    userCommands: Array<{
      hash: string;
      kind: string;
      from: string;
      to: string;
      amount: string;
      fee: string;
      memo: string;
      nonce: number;
      status: string;
      failureReason: string | null;
    }>;
    zkappCommands: Array<{
      hash: string;
      feePayer: string;
      fee: string;
      memo: string;
      status: string;
      failureReason: string | null;
    }>;
  };
}

interface ArchiveTransactionsResponse {
  blocks: ArchiveTransactionBlock[];
  networkState: {
    maxBlockHeight: {
      canonicalMaxBlockHeight: number;
      pendingMaxBlockHeight: number;
    };
  };
}

function flattenArchiveBlocks(
  blocks: ArchiveTransactionBlock[],
): ConfirmedTransaction[] {
  const txs: ConfirmedTransaction[] = [];

  for (const block of blocks) {
    for (const cmd of block.transactions.userCommands || []) {
      const kindUpper = cmd.kind.toUpperCase();
      txs.push({
        hash: cmd.hash,
        type: kindUpper === 'STAKE_DELEGATION' ? 'delegation' : 'payment',
        kind: kindUpper,
        from: cmd.from,
        to: cmd.to,
        amount: cmd.amount,
        fee: cmd.fee,
        memo: cmd.memo,
        nonce: cmd.nonce,
        blockHeight: block.blockHeight,
        dateTime: block.dateTime,
        failureReason: cmd.failureReason,
      });
    }

    for (const cmd of block.transactions.zkappCommands || []) {
      txs.push({
        hash: cmd.hash,
        type: 'zkapp',
        from: cmd.feePayer,
        fee: cmd.fee,
        memo: cmd.memo,
        blockHeight: block.blockHeight,
        dateTime: block.dateTime,
        failureReason: cmd.failureReason,
      });
    }
  }

  return txs;
}

// Query one page of confirmed transactions, filtered to best-chain blocks so
// orphaned fork transactions are excluded (#97). Reuses the #86 degradation
// machinery: archives that reject the inBestChain filter get the unfiltered
// query (previous behavior) and are cached as filter-unsupported.
async function queryTransactionsArchive(
  client: GraphQLClient,
  paginated: boolean,
  variables: Record<string, unknown>,
): Promise<ArchiveTransactionsResponse> {
  if (supportsBestChainFilter(client)) {
    try {
      return await client.query<ArchiveTransactionsResponse>(
        buildTransactionsArchiveQuery(paginated, true),
        variables,
      );
    } catch (error) {
      if (!isBestChainFilterError(error)) throw error;
      markBestChainFilterUnsupported(client);
    }
  }
  return client.query<ArchiveTransactionsResponse>(
    buildTransactionsArchiveQuery(paginated, false),
    variables,
  );
}

export async function fetchTransactionsPaginated(
  blocksPerPage: number = 50,
  beforeHeight?: number,
): Promise<TransactionsPageResult> {
  const client = getClient();

  try {
    const variables: Record<string, unknown> = { limit: blocksPerPage };
    if (beforeHeight) {
      variables.maxBlockHeight = beforeHeight;
    }

    const data = await queryTransactionsArchive(
      client,
      Boolean(beforeHeight),
      variables,
    );
    const totalHeight = data.networkState.maxBlockHeight.pendingMaxBlockHeight;
    const transactions = flattenArchiveBlocks(data.blocks);
    const lastBlock = data.blocks[data.blocks.length - 1];

    return {
      transactions,
      hasMore: lastBlock ? lastBlock.blockHeight > 1 : false,
      nextCursor: lastBlock ? lastBlock.blockHeight : null,
      totalBlockHeight: totalHeight,
      totalPageableBlocks: totalHeight,
      source: 'archive',
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('Cannot query field')) {
      // Archive doesn't support transaction fields — fall back to daemon
      console.log(
        '[API] Archive does not support transaction fields, falling back to daemon...',
      );
      const daemon = await fetchRecentTransactions();
      return {
        transactions: daemon.transactions,
        hasMore: false,
        nextCursor: null,
        // Real chain height, kept for display only — the daemon window is
        // the pageable quantity, so page math must not use this (#90).
        totalBlockHeight: daemon.newestBlockHeight,
        totalPageableBlocks: daemon.blocksScanned,
        source: 'daemon-fallback',
      };
    }
    throw error;
  }
}

export interface RecentTransactionsResult {
  transactions: ConfirmedTransaction[];
  blocksScanned: number;
  oldestBlockHeight: number;
  newestBlockHeight: number;
}

interface DaemonBestChainBlock {
  stateHash: string;
  protocolState: {
    consensusState: {
      blockHeight: string;
    };
    blockchainState: {
      date: string;
    };
  };
  transactions: {
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
          };
        }>;
      };
    }>;
  };
}

interface DaemonBestChainResponse {
  bestChain: DaemonBestChainBlock[];
}

function flattenDaemonBlocks(
  blocks: DaemonBestChainBlock[],
): ConfirmedTransaction[] {
  const txs: ConfirmedTransaction[] = [];

  for (const block of blocks) {
    const blockHeight = parseInt(
      block.protocolState.consensusState.blockHeight,
      10,
    );
    const dateTime = new Date(
      parseInt(block.protocolState.blockchainState.date, 10),
    ).toISOString();

    for (const cmd of block.transactions.userCommands || []) {
      txs.push({
        hash: cmd.hash,
        type: cmd.kind === 'STAKE_DELEGATION' ? 'delegation' : 'payment',
        kind: cmd.kind,
        from: cmd.from,
        to: cmd.to,
        amount: cmd.amount,
        fee: cmd.fee,
        memo: cmd.memo,
        nonce: cmd.nonce,
        blockHeight,
        dateTime,
        failureReason: cmd.failureReason,
      });
    }

    for (const cmd of block.transactions.zkappCommands || []) {
      txs.push({
        hash: cmd.hash,
        type: 'zkapp',
        from: cmd.zkappCommand.feePayer.body.publicKey,
        fee: cmd.zkappCommand.feePayer.body.fee,
        memo: cmd.zkappCommand.memo,
        blockHeight,
        dateTime,
        failureReason:
          cmd.failureReasons?.flatMap(fr => fr.failures).join(', ') ||
          undefined,
      });
    }
  }

  return txs;
}

export async function fetchRecentTransactions(
  maxBlocks: number = MAX_DAEMON_BLOCKS,
): Promise<RecentTransactionsResult> {
  const limit = Math.min(maxBlocks, MAX_DAEMON_BLOCKS);

  const query = `{
    bestChain(maxLength: ${limit}) {
      stateHash
      protocolState {
        consensusState {
          blockHeight
        }
        blockchainState {
          date
        }
      }
      transactions {
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
              }
            }
          }
        }
      }
    }
  }`;

  try {
    const data = await queryDaemon<DaemonBestChainResponse>(query);
    const blocks = data.bestChain || [];

    if (blocks.length === 0) {
      return {
        transactions: [],
        blocksScanned: 0,
        oldestBlockHeight: 0,
        newestBlockHeight: 0,
      };
    }

    // bestChain returns oldest-first; reverse for newest-first
    const sorted = [...blocks].reverse();
    const transactions = flattenDaemonBlocks(sorted);

    const heights = sorted.map(b =>
      parseInt(b.protocolState.consensusState.blockHeight, 10),
    );

    return {
      transactions,
      // Clamp defensively: a nonconforming daemon returning more than the
      // requested window must not inflate the pageable count downstream (#90).
      blocksScanned: Math.min(sorted.length, MAX_DAEMON_BLOCKS),
      oldestBlockHeight: Math.min(...heights),
      newestBlockHeight: Math.max(...heights),
    };
  } catch (error) {
    if (isCorsError(error)) {
      throw new Error(
        'Unable to reach the daemon endpoint. ' +
          'Cross-origin requests are not allowed from this domain.',
      );
    }
    throw error;
  }
}
