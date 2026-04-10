import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { HashLink, TimeAgo, Amount, LoadingSpinner } from '@/components/common';
import { formatNumber } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import type { BlockSummary } from '@/types';

interface BlockListProps {
  blocks: BlockSummary[];
  loading: boolean;
  error: string | null;
}

export function BlockList({
  blocks,
  loading,
  error,
}: BlockListProps): ReactNode {
  if (loading) {
    return <LoadingSpinner text="Loading blocks..." />;
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="rounded-md bg-primary/10 p-4 text-sm text-primary">
        No blocks found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Height</th>
            <th className="px-4 py-3">State Hash</th>
            <th className="px-4 py-3">Block Producer</th>
            <th className="px-4 py-3 text-right">Txs</th>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3 text-right">Coinbase</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {blocks.map(block => (
            <tr
              key={block.stateHash}
              className={cn(
                'transition-colors hover:bg-accent/50',
                !block.canonical && 'bg-yellow-500/5',
              )}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/block/${block.blockHeight}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {formatNumber(block.blockHeight)}
                  </Link>
                  {!block.canonical && (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-600 dark:text-yellow-400"
                      title="This block is pending finalization"
                    >
                      <AlertTriangle size={12} />
                      Pending
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <HashLink
                  hash={block.stateHash}
                  type="block"
                  linkTo={`/block/${block.blockHeight}`}
                />
              </td>
              <td className="px-4 py-3">
                <HashLink hash={block.creator} type="account" />
              </td>
              <td className="px-4 py-3 text-right">
                <span className="font-mono">{block.transactionCount ?? 0}</span>
              </td>
              <td className="px-4 py-3">
                <TimeAgo dateTime={block.dateTime} />
              </td>
              <td className="px-4 py-3 text-right">
                <Amount value={block.coinbase || '0'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
