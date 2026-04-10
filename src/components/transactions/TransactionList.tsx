import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HashLink, TimeAgo, Amount, LoadingSpinner } from '@/components/common';
import { formatNumber } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import type { ConfirmedTransaction } from '@/services/api/transactions';

interface TransactionListProps {
  transactions: ConfirmedTransaction[];
  loading: boolean;
  error: string | null;
}

const typeBadgeClasses: Record<string, string> = {
  payment: 'bg-primary/10 text-primary',
  delegation: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  zkapp: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

function TypeBadge({ type }: { type: string }): ReactNode {
  return (
    <span
      className={cn(
        'rounded px-2 py-0.5 text-xs font-medium',
        typeBadgeClasses[type] || 'bg-muted text-muted-foreground',
      )}
    >
      {type}
    </span>
  );
}

export function TransactionList({
  transactions,
  loading,
  error,
}: TransactionListProps): ReactNode {
  if (loading) {
    return <LoadingSpinner text="Loading transactions..." />;
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-md bg-primary/10 p-4 text-sm text-primary">
        No transactions found in these blocks.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Hash</th>
            <th className="px-4 py-3">From</th>
            <th className="px-4 py-3">To</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-right">Fee</th>
            <th className="px-4 py-3 text-right">Block</th>
            <th className="px-4 py-3">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {transactions.map(tx => (
            <tr
              key={`${tx.hash}-${tx.blockHeight}`}
              className="transition-colors hover:bg-accent/50"
            >
              <td className="px-4 py-3">
                <TypeBadge type={tx.type} />
              </td>
              <td className="px-4 py-3">
                <HashLink hash={tx.hash} type="transaction" />
              </td>
              <td className="px-4 py-3">
                <HashLink hash={tx.from} type="account" />
              </td>
              <td className="px-4 py-3">
                {tx.to ? (
                  <HashLink hash={tx.to} type="account" />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {tx.amount ? (
                  <Amount value={tx.amount} />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Amount value={tx.fee} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  to={`/block/${tx.blockHeight}`}
                  className="font-medium text-primary hover:underline"
                >
                  {formatNumber(tx.blockHeight)}
                </Link>
              </td>
              <td className="px-4 py-3">
                <TimeAgo dateTime={tx.dateTime} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
