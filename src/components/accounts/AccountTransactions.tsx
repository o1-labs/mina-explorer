import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownLeft, Sparkles } from 'lucide-react';
import { useAccountTransactions } from '@/hooks';
import {
  HashLink,
  Amount,
  LoadingSpinner,
  FailedBadge,
} from '@/components/common';
import { formatNumber, formatTimeAgo, decodeMemo } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { ACCOUNT_TX_SEARCH_WINDOW } from '@/services/api/transactions';
import type { AccountTransaction } from '@/services/api/transactions';

interface AccountTransactionsProps {
  publicKey: string;
}

export function AccountTransactions({
  publicKey,
}: AccountTransactionsProps): ReactNode {
  const { transactions, loading, error } = useAccountTransactions(publicKey);
  // Disclose the scan window so a partial (or empty) history is never
  // presented as the complete record (#89).
  const searchWindow = ACCOUNT_TX_SEARCH_WINDOW.toLocaleString('en-US');

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <LoadingSpinner size="sm" text="Loading transaction history..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="font-semibold">Transaction History</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {transactions.length} transactions found in the most recent{' '}
          {searchWindow} blocks
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground">
          No transactions found for this account in the most recent{' '}
          {searchWindow} blocks. Older activity may exist beyond this window.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {transactions.map(tx => (
            <TransactionRow key={tx.hash} tx={tx} />
          ))}
        </div>
      )}
    </div>
  );
}

interface TransactionRowProps {
  tx: AccountTransaction;
}

function TransactionRow({ tx }: TransactionRowProps): ReactNode {
  const getIcon = (): ReactNode => {
    if (tx.type === 'zkapp') {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/10">
          <Sparkles className="h-4 w-4 text-purple-500" />
        </div>
      );
    }
    if (tx.type === 'sent') {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
          <ArrowUpRight className="h-4 w-4 text-red-500" />
        </div>
      );
    }
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
        <ArrowDownLeft className="h-4 w-4 text-green-500" />
      </div>
    );
  };

  const getTypeLabel = (): string => {
    if (tx.type === 'zkapp') return 'zkApp';
    if (tx.type === 'sent') return tx.kind || 'Sent';
    return tx.kind || 'Received';
  };

  const memoText = tx.memo ? decodeMemo(tx.memo) : '';

  return (
    <div className="flex items-center gap-4 px-6 py-4">
      {getIcon()}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded px-2 py-0.5 text-xs font-medium',
              tx.type === 'zkapp'
                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                : tx.type === 'sent'
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                  : 'bg-green-500/10 text-green-600 dark:text-green-400',
            )}
          >
            {getTypeLabel()}
          </span>
          {tx.failureReason && <FailedBadge />}
          <Link
            to={`/transaction/${tx.hash}`}
            className="truncate font-mono text-xs text-muted-foreground hover:text-primary"
          >
            {tx.hash.slice(0, 16)}...
          </Link>
        </div>

        <div className="mt-1 flex items-center gap-2 text-sm">
          {tx.counterparty && (
            <>
              <span className="text-muted-foreground">
                {tx.type === 'sent' ? 'to' : 'from'}
              </span>
              <HashLink hash={tx.counterparty} type="account" />
            </>
          )}
          {memoText && (
            <span className="truncate text-muted-foreground">· {memoText}</span>
          )}
        </div>
      </div>

      <div className="text-right">
        {tx.amount && (
          <div
            className={cn(
              'font-mono',
              tx.failureReason
                ? 'text-muted-foreground line-through'
                : tx.type === 'sent'
                  ? 'text-red-600 dark:text-red-400'
                  : tx.type === 'received'
                    ? 'text-green-600 dark:text-green-400'
                    : '',
            )}
          >
            {!tx.failureReason &&
              (tx.type === 'sent' ? '-' : tx.type === 'received' ? '+' : '')}
            <Amount value={tx.amount} />
          </div>
        )}
        <div className="mt-1 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Link
            to={`/block/${tx.blockHeight}`}
            className="hover:text-foreground"
          >
            #{formatNumber(tx.blockHeight)}
          </Link>
          <span>·</span>
          <span>{formatTimeAgo(tx.dateTime)}</span>
        </div>
      </div>
    </div>
  );
}
