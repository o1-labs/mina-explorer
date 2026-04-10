import { useState, type ReactNode } from 'react';
import {
  HashLink,
  Amount,
  LoadingSpinner,
  CopyButton,
} from '@/components/common';
import {
  formatDateTime,
  formatNumber,
  decodeMemo,
  formatMina,
} from '@/utils/formatters';
import { cn } from '@/lib/utils';
import type { BlockDetail as BlockDetailType } from '@/types';

interface BlockDetailProps {
  block: BlockDetailType | null;
  loading: boolean;
  error: string | null;
}

type TransactionTab = 'user' | 'zkapp' | 'fees';

export function BlockDetail({
  block,
  loading,
  error,
}: BlockDetailProps): ReactNode {
  const [showJson, setShowJson] = useState(false);
  const [activeTab, setActiveTab] = useState<TransactionTab>('user');

  if (loading) {
    return <LoadingSpinner text="Loading block..." />;
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!block) {
    return (
      <div className="rounded-md bg-warning/10 p-4 text-sm text-warning">
        Block not found.
      </div>
    );
  }

  const userCommandCount = block.transactions?.userCommands?.length || 0;
  const zkappCommandCount = block.transactions?.zkappCommands?.length || 0;
  const feeTransferCount = block.transactions?.feeTransfer?.length || 0;
  const totalTxCount = userCommandCount + zkappCommandCount;

  return (
    <div className="space-y-4">
      {/* Block Info Card */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">
              Block #{formatNumber(block.blockHeight)}
            </h2>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                block.canonical
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
              )}
            >
              {block.canonical ? 'Canonical' : 'Pending'}
            </span>
          </div>
          <button
            className={cn(
              'rounded-md border border-input px-3 py-1.5 text-sm',
              'transition-colors hover:bg-accent',
            )}
            onClick={() => setShowJson(!showJson)}
          >
            {showJson ? 'Hide JSON' : 'View JSON'}
          </button>
        </div>
        <div className="p-6">
          {showJson ? (
            <pre className="max-h-[600px] overflow-auto rounded-md bg-accent p-4 font-mono text-xs">
              {JSON.stringify(block, null, 2)}
            </pre>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Block Height</span>
                  <span className="font-mono">
                    {formatNumber(block.blockHeight)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 border-b border-border pb-2">
                  <span className="text-muted-foreground">State Hash</span>
                  <div className="flex items-start gap-2">
                    <span className="break-all font-mono text-sm">
                      {block.stateHash}
                    </span>
                    <CopyButton text={block.stateHash} />
                  </div>
                </div>
                {block.parentHash && (
                  <div className="flex flex-col gap-1 border-b border-border pb-2">
                    <span className="text-muted-foreground">Parent Hash</span>
                    <div className="flex items-start gap-2">
                      <HashLink
                        hash={block.parentHash}
                        type="block"
                        truncate={false}
                      />
                    </div>
                  </div>
                )}
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Timestamp</span>
                  <span>{formatDateTime(block.dateTime)}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Transactions</span>
                  <span className="font-mono">{totalTxCount}</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Block Producer</span>
                  <HashLink hash={block.creator} type="account" />
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Coinbase Reward</span>
                  <Amount
                    value={block.transactions?.coinbase || '0'}
                    showFiat
                  />
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">
                    Transaction Fees
                  </span>
                  <Amount value={block.txFees || '0'} showFiat />
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Snark Fees</span>
                  <Amount value={block.snarkFees || '0'} showFiat />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transactions Card */}
      {!showJson && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h3 className="font-semibold">Transactions</h3>
          </div>
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              className={cn(
                'px-6 py-3 text-sm font-medium transition-colors',
                activeTab === 'user'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab('user')}
            >
              User Commands ({userCommandCount})
            </button>
            <button
              className={cn(
                'px-6 py-3 text-sm font-medium transition-colors',
                activeTab === 'zkapp'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab('zkapp')}
            >
              zkApp Commands ({zkappCommandCount})
            </button>
            <button
              className={cn(
                'px-6 py-3 text-sm font-medium transition-colors',
                activeTab === 'fees'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab('fees')}
            >
              Fee Transfers ({feeTransferCount})
            </button>
          </div>
          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'user' && (
              <UserCommandsTable
                commands={block.transactions?.userCommands || []}
              />
            )}
            {activeTab === 'zkapp' && (
              <ZkAppCommandsTable
                commands={block.transactions?.zkappCommands || []}
              />
            )}
            {activeTab === 'fees' && (
              <FeeTransfersTable
                transfers={block.transactions?.feeTransfer || []}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface UserCommandsTableProps {
  commands: BlockDetailType['transactions']['userCommands'];
}

function UserCommandsTable({ commands }: UserCommandsTableProps): ReactNode {
  if (commands.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No user commands in this block
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Hash
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Type
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              From
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">To</th>
            <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">
              Amount
            </th>
            <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">
              Fee
            </th>
            <th className="pb-3 font-medium text-muted-foreground">Memo</th>
          </tr>
        </thead>
        <tbody>
          {commands.map((cmd, idx) => (
            <tr key={cmd.hash || idx} className="border-b border-border">
              <td className="py-3 pr-4">
                <span className="font-mono text-xs">
                  {cmd.hash ? `${cmd.hash.slice(0, 12)}...` : '-'}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-medium',
                    cmd.kind === 'PAYMENT'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
                  )}
                >
                  {cmd.kind}
                </span>
              </td>
              <td className="py-3 pr-4">
                <HashLink hash={cmd.from} type="account" />
              </td>
              <td className="py-3 pr-4">
                <HashLink hash={cmd.to} type="account" />
              </td>
              <td className="py-3 pr-4 text-right font-mono">
                {formatMina(cmd.amount)} MINA
              </td>
              <td className="py-3 pr-4 text-right font-mono text-muted-foreground">
                {formatMina(cmd.fee)}
              </td>
              <td className="max-w-[200px] truncate py-3 text-muted-foreground">
                {decodeMemo(cmd.memo) || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ZkAppCommandsTableProps {
  commands: BlockDetailType['transactions']['zkappCommands'];
}

function ZkAppCommandsTable({ commands }: ZkAppCommandsTableProps): ReactNode {
  if (commands.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No zkApp commands in this block
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Hash
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Fee Payer
            </th>
            <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">
              Fee
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Account Updates
            </th>
            <th className="pb-3 font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {commands.map((cmd, idx) => (
            <tr key={cmd.hash || idx} className="border-b border-border">
              <td className="py-3 pr-4">
                <span className="font-mono text-xs">
                  {cmd.hash ? `${cmd.hash.slice(0, 12)}...` : '-'}
                </span>
              </td>
              <td className="py-3 pr-4">
                <HashLink
                  hash={cmd.zkappCommand.feePayer.body.publicKey}
                  type="account"
                />
              </td>
              <td className="py-3 pr-4 text-right font-mono">
                {formatMina(cmd.zkappCommand.feePayer.body.fee)} MINA
              </td>
              <td className="py-3 pr-4 font-mono">
                {cmd.zkappCommand.accountUpdates?.length || 0}
              </td>
              <td className="py-3">
                {cmd.failureReason && cmd.failureReason.length > 0 ? (
                  <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                    Failed
                  </span>
                ) : (
                  <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                    Applied
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface FeeTransfersTableProps {
  transfers: BlockDetailType['transactions']['feeTransfer'];
}

function FeeTransfersTable({ transfers }: FeeTransfersTableProps): ReactNode {
  if (transfers.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No fee transfers in this block
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Recipient
            </th>
            <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">
              Fee
            </th>
            <th className="pb-3 font-medium text-muted-foreground">Type</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((ft, idx) => (
            <tr
              key={`${ft.recipient}-${idx}`}
              className="border-b border-border"
            >
              <td className="py-3 pr-4">
                <HashLink hash={ft.recipient} type="account" />
              </td>
              <td className="py-3 pr-4 text-right font-mono">
                {formatMina(ft.fee)} MINA
              </td>
              <td className="py-3">
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-medium',
                    ft.type === 'Fee_transfer_via_coinbase'
                      ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                      : 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                  )}
                >
                  {ft.type.replace(/_/g, ' ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
