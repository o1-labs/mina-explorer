import { getClient } from './client';
import { queryDaemon, isCorsError, MAX_DAEMON_BLOCKS } from './daemon';

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

// Query to search for transactions in recent blocks (full version with zkappCommands)
const SEARCH_TRANSACTION_QUERY_FULL = `
  query SearchTransaction($limit: Int!) {
    blocks(
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
      blockHeight
      stateHash
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
  }
`;

// Fallback query without zkappCommands (for endpoints that don't support it)
const SEARCH_TRANSACTION_QUERY_BASIC = `
  query SearchTransactionBasic($limit: Int!) {
    blocks(
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
      blockHeight
      stateHash
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
          failureReason
        }
      }
    }
  }
`;

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

  // Try full query first (with zkappCommands)
  try {
    const data = await client.query<SearchTransactionResponse>(
      SEARCH_TRANSACTION_QUERY_FULL,
      { limit: 1000 },
    );
    const result = searchBlocks(data);
    if (result) return result;
  } catch (error) {
    // Check if zkappCommands is not supported
    const errorMessage = error instanceof Error ? error.message : '';
    if (
      errorMessage.includes('zkappCommands') ||
      errorMessage.includes('Cannot query field')
    ) {
      // Fall back to basic query without zkappCommands
      console.log('[API] zkappCommands not supported, using basic query...');
      try {
        const data = await client.query<SearchTransactionResponse>(
          SEARCH_TRANSACTION_QUERY_BASIC,
          { limit: 1000 },
        );
        const result = searchBlocks(data);
        if (result) return result;
      } catch (basicError) {
        console.error('[API] Error with basic transaction search:', basicError);
      }
    } else {
      console.error('[API] Error searching for transaction:', error);
    }
  }

  return null;
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
}

/**
 * Fetch transaction history for an account
 * Returns sent and received transactions
 */
export async function fetchAccountTransactions(
  publicKey: string,
  limit: number = 500,
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
          });
        }
      }
    }
  };

  // Try full query first
  try {
    const data = await client.query<SearchTransactionResponse>(
      SEARCH_TRANSACTION_QUERY_FULL,
      { limit },
    );
    extractTransactions(data);
  } catch (error) {
    // Check if zkappCommands is not supported
    const errorMessage = error instanceof Error ? error.message : '';
    if (
      errorMessage.includes('zkappCommands') ||
      errorMessage.includes('Cannot query field')
    ) {
      // Fall back to basic query
      console.log(
        '[API] zkappCommands not supported, using basic query for account transactions...',
      );
      try {
        const data = await client.query<SearchTransactionResponse>(
          SEARCH_TRANSACTION_QUERY_BASIC,
          { limit },
        );
        extractTransactions(data);
      } catch (basicError) {
        console.error(
          '[API] Error with basic account transactions:',
          basicError,
        );
      }
    } else {
      console.error('[API] Error fetching account transactions:', error);
    }
  }

  // Sort by block height descending (newest first)
  return transactions.sort((a, b) => b.blockHeight - a.blockHeight);
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
      blocksScanned: sorted.length,
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
