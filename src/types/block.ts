/**
 * Where a block sits relative to the best chain:
 * - 'canonical' — finalized on the best chain
 * - 'pending' — on the best chain but not yet finalized
 * - 'orphaned' — on an abandoned fork (not part of the best chain)
 */
export type ChainStatus = 'canonical' | 'pending' | 'orphaned';

export interface Block {
  blockHeight: number;
  stateHash: string;
  parentHash: string;
  creator: string;
  creatorAccount: {
    publicKey: string;
  };
  dateTime: string;
  txFees: string;
  snarkFees: string;
  canonical: boolean;
  chainStatus: ChainStatus;
  receivedTime: string;
  winnerAccount: {
    publicKey: string;
  };
  protocolState: {
    consensusState: {
      epoch: number;
      slot: number;
      blockHeight: number;
    };
    previousStateHash: string;
  };
}

export interface BlockSummary {
  blockHeight: number;
  stateHash: string;
  creator: string;
  dateTime: string;
  txFees: string;
  snarkFees: string;
  canonical: boolean;
  transactionCount?: number | undefined;
  coinbase?: string | undefined;
  epoch?: number | undefined;
  slot?: number | undefined;
  slotSinceGenesis?: number | undefined;
}

export interface BlockDetail extends Block {
  transactions: {
    userCommands: UserCommand[];
    zkappCommands: ZkAppCommand[];
    feeTransfer: FeeTransfer[];
    coinbase: string;
  };
}

export interface UserCommand {
  hash: string;
  kind: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  memo: string;
  nonce: number;
  failureReason: string | null;
  dateTime: string;
}

export interface ZkAppCommand {
  hash: string;
  zkappCommand: {
    memo: string;
    feePayer: {
      body: {
        publicKey: string;
        fee: string;
      };
    };
    accountUpdates: AccountUpdate[];
  };
  failureReason: string[] | null;
  dateTime: string;
}

export interface AccountUpdate {
  body: {
    publicKey: string;
    tokenId: string;
    balanceChange: {
      magnitude: string;
      sgn: string;
    };
    callDepth: number;
  };
}

export interface FeeTransfer {
  recipient: string;
  fee: string;
  type: string;
}
