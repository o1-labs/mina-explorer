import { useState, type ReactNode } from 'react';
import {
  RefreshCw,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { HashLink, Amount, LoadingSpinner } from '@/components/common';
import { TransactionList } from '@/components/transactions';
import {
  useRecentTransactions,
  usePendingTransactions,
  usePendingZkAppCommands,
  useNetwork,
} from '@/hooks';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/utils/formatters';
import { generatePageNumbers } from '@/utils/pagination';

type Tab = 'confirmed' | 'mempool';
type MempoolTab = 'user' | 'zkapp';

export function TransactionsPage(): ReactNode {
  const [activeTab, setActiveTab] = useState<Tab>('confirmed');
  const [mempoolTab, setMempoolTab] = useState<MempoolTab>('user');
  const [showQuery, setShowQuery] = useState(false);
  const { network } = useNetwork();

  const {
    transactions: confirmedTxs,
    allTransactions,
    loading: confirmedLoading,
    error: confirmedError,
    blocksScanned,
    page,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    refresh: refreshConfirmed,
  } = useRecentTransactions(30);

  const {
    transactions: pendingTxs,
    loading: pendingLoading,
    error: pendingError,
    refetch: refetchPending,
  } = usePendingTransactions();

  const {
    commands: pendingZkApps,
    loading: zkLoading,
    error: zkError,
    refetch: refetchZk,
  } = usePendingZkAppCommands();

  const loading =
    activeTab === 'confirmed' ? confirmedLoading : pendingLoading || zkLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          {activeTab === 'confirmed' && blocksScanned > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatNumber(allTransactions.length)} transactions from last{' '}
              {blocksScanned} blocks on {network.displayName}
            </p>
          )}
          {activeTab === 'mempool' && (
            <p className="text-sm text-muted-foreground">
              Mempool on {network.displayName}
            </p>
          )}
        </div>
        <button
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent',
            loading && 'opacity-50',
          )}
          onClick={() => {
            if (activeTab === 'confirmed') {
              refreshConfirmed();
            } else {
              refetchPending();
              refetchZk();
            }
          }}
          disabled={loading}
        >
          <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('confirmed')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'confirmed'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Confirmed
        </button>
        <button
          onClick={() => setActiveTab('mempool')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'mempool'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Mempool
        </button>
      </div>

      {/* Confirmed tab */}
      {activeTab === 'confirmed' && (
        <>
          <TransactionList
            transactions={confirmedTxs}
            loading={confirmedLoading}
            error={confirmedError}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {page} of {formatNumber(totalPages)}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(1)}
                  disabled={page === 1 || confirmedLoading}
                  className={cn(
                    'p-2 rounded-md transition-colors',
                    page === 1 || confirmedLoading
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                  title="First page"
                >
                  <ChevronsLeft size={18} />
                </button>
                <button
                  onClick={prevPage}
                  disabled={page === 1 || confirmedLoading}
                  className={cn(
                    'p-2 rounded-md transition-colors',
                    page === 1 || confirmedLoading
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                  title="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>

                {/* Page numbers */}
                <div className="flex items-center gap-1 px-2">
                  {generatePageNumbers(page, totalPages).map((pageNum, idx) =>
                    pageNum === '...' ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 text-muted-foreground"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum as number)}
                        disabled={confirmedLoading}
                        className={cn(
                          'min-w-[32px] h-8 px-2 rounded-md text-sm transition-colors',
                          pageNum === page
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent',
                        )}
                      >
                        {pageNum}
                      </button>
                    ),
                  )}
                </div>

                <button
                  onClick={nextPage}
                  disabled={page === totalPages || confirmedLoading}
                  className={cn(
                    'p-2 rounded-md transition-colors',
                    page === totalPages || confirmedLoading
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                  title="Next page"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={page === totalPages || confirmedLoading}
                  className={cn(
                    'p-2 rounded-md transition-colors',
                    page === totalPages || confirmedLoading
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                  title="Last page"
                >
                  <ChevronsRight size={18} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Mempool tab */}
      {activeTab === 'mempool' && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex gap-4">
              <button
                onClick={() => setMempoolTab('user')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  mempoolTab === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                User Transactions ({pendingTxs.length})
              </button>
              <button
                onClick={() => setMempoolTab('zkapp')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  mempoolTab === 'zkapp'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                zkApp Commands ({pendingZkApps.length})
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowQuery(!showQuery)}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Show GraphQL query"
              >
                <Info size={16} />
              </button>
              <button
                onClick={() =>
                  mempoolTab === 'user' ? refetchPending() : refetchZk()
                }
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {showQuery && (
            <div className="border-b border-border bg-accent/30 px-6 py-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                GraphQL Query (Daemon Endpoint: {network.displayName})
              </p>
              <pre className="overflow-x-auto rounded bg-accent p-3 font-mono text-xs">
                {mempoolTab === 'user'
                  ? `query {
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
}`
                  : `query {
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
}`}
              </pre>
            </div>
          )}

          <div className="p-6">
            {mempoolTab === 'user' ? (
              pendingLoading ? (
                <LoadingSpinner text="Loading pending transactions..." />
              ) : pendingError ? (
                <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                  {pendingError}
                </div>
              ) : pendingTxs.length === 0 ? (
                <p className="text-muted-foreground">
                  No pending transactions in the mempool.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Hash</th>
                        <th className="px-4 py-3">From</th>
                        <th className="px-4 py-3">To</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right">Fee</th>
                        <th className="px-4 py-3 text-right">Nonce</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pendingTxs.map(tx => (
                        <tr
                          key={tx.hash}
                          className="transition-colors hover:bg-accent/50"
                        >
                          <td className="px-4 py-3">
                            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {tx.kind}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <HashLink hash={tx.hash} type="transaction" />
                          </td>
                          <td className="px-4 py-3">
                            <HashLink hash={tx.from} type="account" />
                          </td>
                          <td className="px-4 py-3">
                            <HashLink hash={tx.to} type="account" />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Amount value={tx.amount} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Amount value={tx.fee} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm">
                            {tx.nonce}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : zkLoading ? (
              <LoadingSpinner text="Loading pending zkApp commands..." />
            ) : zkError ? (
              <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                {zkError}
              </div>
            ) : pendingZkApps.length === 0 ? (
              <p className="text-muted-foreground">
                No pending zkApp commands in the mempool.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Hash</th>
                      <th className="px-4 py-3">Fee Payer</th>
                      <th className="px-4 py-3 text-right">Fee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pendingZkApps.map(cmd => (
                      <tr
                        key={cmd.hash}
                        className="transition-colors hover:bg-accent/50"
                      >
                        <td className="px-4 py-3">
                          <HashLink hash={cmd.hash} type="transaction" />
                        </td>
                        <td className="px-4 py-3">
                          <HashLink hash={cmd.feePayer} type="account" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Amount value={cmd.fee} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
