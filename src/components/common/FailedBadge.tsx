import type { ReactNode } from 'react';

/**
 * Small red "Failed" pill for a transaction/command that failed on-chain
 * (funds did not move). Shared by BlockDetail, TransactionList, and
 * AccountTransactions so the treatment stays consistent.
 */
export function FailedBadge(): ReactNode {
  return (
    <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
      Failed
    </span>
  );
}
