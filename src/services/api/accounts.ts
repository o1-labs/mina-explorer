import type { Account } from '@/types';
import { NETWORKS, resolveActiveNetworkId } from '@/config';

function getDaemonEndpoint(): string {
  return NETWORKS[resolveActiveNetworkId()].daemonEndpoint;
}

// Daemon GraphQL query for account data
// Note: The daemon uses PublicKey scalar type, not String
const DAEMON_ACCOUNT_QUERY = `
  query GetAccount($publicKey: PublicKey!) {
    account(publicKey: $publicKey) {
      publicKey
      balance {
        total
        blockHeight
      }
      nonce
      delegate
      votingFor
      receiptChainHash
      tokenId
      tokenSymbol
      zkappUri
      zkappState
      provedState
      timing {
        initialMinimumBalance
        cliffTime
        cliffAmount
        vestingPeriod
        vestingIncrement
      }
      permissions {
        editState
        access
        send
        receive
        setDelegate
        setPermissions
        setVerificationKey
        setZkappUri
        editActionState
        setTokenSymbol
        incrementNonce
        setVotingFor
        setTiming
      }
    }
  }
`;

// Simplified query for basic account info
const DAEMON_ACCOUNT_SIMPLE_QUERY = `
  query GetAccount($publicKey: PublicKey!) {
    account(publicKey: $publicKey) {
      publicKey
      balance {
        total
      }
      nonce
      delegate
    }
  }
`;

interface DaemonAccountResponse {
  account: {
    publicKey: string;
    balance: {
      total: string;
      blockHeight?: string;
    };
    nonce: string;
    delegate: string | null;
    votingFor: string | null;
    receiptChainHash: string | null;
    tokenId: string | null;
    tokenSymbol: string | null;
    zkappUri: string | null;
    zkappState: string[] | null;
    provedState: boolean | null;
    timing: {
      initialMinimumBalance: string;
      cliffTime: string;
      cliffAmount: string;
      vestingPeriod: string;
      vestingIncrement: string;
    } | null;
    permissions: {
      editState: string;
      access: string;
      send: string;
      receive: string;
      setDelegate: string;
      setPermissions: string;
      setVerificationKey: string | Record<string, unknown>;
      setZkappUri: string;
      editActionState: string;
      setTokenSymbol: string;
      incrementNonce: string;
      setVotingFor: string;
      setTiming: string;
    } | null;
  } | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function queryDaemon<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const endpoint = getDaemonEndpoint();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors && result.errors.length > 0) {
    const errorMessages = result.errors.map(e => e.message).join(', ');
    throw new Error(`GraphQL error: ${errorMessages}`);
  }

  if (!result.data) {
    throw new Error('No data in response');
  }

  return result.data;
}

function transformDaemonAccount(
  daemonAccount: DaemonAccountResponse['account'],
): Account | null {
  if (!daemonAccount) {
    return null;
  }

  // Check if timing has any non-null values
  const hasTimingData =
    daemonAccount.timing &&
    (daemonAccount.timing.initialMinimumBalance !== null ||
      daemonAccount.timing.cliffTime !== null);

  return {
    publicKey: daemonAccount.publicKey,
    balance: {
      total: daemonAccount.balance.total,
      liquid: null, // Daemon doesn't provide liquid/locked breakdown directly
      locked: null,
    },
    nonce: parseInt(daemonAccount.nonce, 10),
    delegate: daemonAccount.delegate,
    votingFor: daemonAccount.votingFor,
    receiptChainHash: daemonAccount.receiptChainHash,
    timing:
      hasTimingData && daemonAccount.timing
        ? {
            initialMinimumBalance: daemonAccount.timing.initialMinimumBalance,
            cliffTime: daemonAccount.timing.cliffTime
              ? parseInt(daemonAccount.timing.cliffTime, 10)
              : null,
            cliffAmount: daemonAccount.timing.cliffAmount,
            vestingPeriod: daemonAccount.timing.vestingPeriod
              ? parseInt(daemonAccount.timing.vestingPeriod, 10)
              : null,
            vestingIncrement: daemonAccount.timing.vestingIncrement,
          }
        : null,
    permissions: daemonAccount.permissions,
    zkappState: daemonAccount.zkappState,
    zkappUri: daemonAccount.zkappUri,
    tokenSymbol: daemonAccount.tokenSymbol,
  };
}

function isCorsError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('CORS'))
  );
}

export async function fetchAccount(publicKey: string): Promise<Account | null> {
  // Try the full query first
  try {
    const data = await queryDaemon<DaemonAccountResponse>(
      DAEMON_ACCOUNT_QUERY,
      { publicKey },
    );
    return transformDaemonAccount(data.account);
  } catch (fullQueryError) {
    // Check for CORS/network errors
    if (isCorsError(fullQueryError)) {
      throw new Error(
        'Unable to reach daemon endpoint. The Mina daemon does not allow ' +
          'cross-origin requests from this domain. Account lookups require ' +
          'running the explorer locally or using a CORS proxy.',
      );
    }

    // Fall back to simple query
    try {
      const data = await queryDaemon<DaemonAccountResponse>(
        DAEMON_ACCOUNT_SIMPLE_QUERY,
        { publicKey },
      );
      if (data.account) {
        return {
          publicKey: data.account.publicKey,
          balance: {
            total: data.account.balance.total,
            liquid: null,
            locked: null,
          },
          nonce: parseInt(data.account.nonce, 10),
          delegate: data.account.delegate,
          votingFor: null,
          receiptChainHash: null,
          timing: null,
          permissions: null,
          zkappState: null,
          zkappUri: null,
          tokenSymbol: null,
        };
      }
      return null;
    } catch (simpleQueryError) {
      // Check for CORS/network errors
      if (isCorsError(simpleQueryError)) {
        throw new Error(
          'Unable to reach daemon endpoint. The Mina daemon does not allow ' +
            'cross-origin requests from this domain. Account lookups require ' +
            'running the explorer locally or using a CORS proxy.',
        );
      }
      // Re-throw the original error for better debugging
      throw fullQueryError;
    }
  }
}
