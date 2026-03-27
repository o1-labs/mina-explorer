import type { AccountTransaction } from '@/services/api/transactions';

export type DateRangePreset = '7d' | '30d' | '90d' | 'all';
export type TransactionTypeFilter = 'all' | 'sent' | 'received' | 'zkapp';

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

/**
 * Get date range from preset
 */
export function getDateRangeFromPreset(preset: DateRangePreset): DateRange {
  const now = new Date();
  const to = new Date(now);

  switch (preset) {
    case '7d': {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { from, to };
    }
    case '30d': {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from, to };
    }
    case '90d': {
      const from = new Date(now);
      from.setDate(from.getDate() - 90);
      return { from, to };
    }
    case 'all':
    default:
      return { from: null, to: null };
  }
}

/**
 * Filter transactions by date range
 */
export function filterTransactionsByDateRange(
  transactions: AccountTransaction[],
  dateRange: DateRange,
): AccountTransaction[] {
  if (!dateRange.from && !dateRange.to) {
    return transactions;
  }

  return transactions.filter(tx => {
    const txDate = new Date(tx.dateTime);

    if (dateRange.from && txDate < dateRange.from) {
      return false;
    }

    if (dateRange.to && txDate > dateRange.to) {
      return false;
    }

    return true;
  });
}

/**
 * Filter transactions by type
 */
export function filterTransactionsByType(
  transactions: AccountTransaction[],
  typeFilter: TransactionTypeFilter,
): AccountTransaction[] {
  if (typeFilter === 'all') {
    return transactions;
  }

  return transactions.filter(tx => tx.type === typeFilter);
}

/**
 * Get preset label for UI display
 */
export function getPresetLabel(preset: DateRangePreset): string {
  switch (preset) {
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case '90d':
      return 'Last 90 days';
    case 'all':
      return 'All time';
    default:
      return 'All time';
  }
}
