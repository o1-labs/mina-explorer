import { useState, type ReactNode } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AccountTransaction } from '@/services/api/transactions';
import { exportTransactionsToCSV } from '@/utils/csvExport';
import {
  type DateRangePreset,
  type TransactionTypeFilter,
  getDateRangeFromPreset,
  filterTransactionsByDateRange,
  filterTransactionsByType,
  getPresetLabel,
} from '@/utils/transactionFilters';

interface TransactionExportButtonProps {
  transactions: AccountTransaction[];
  publicKey: string;
}

export function TransactionExportButton({
  transactions,
  publicKey,
}: TransactionExportButtonProps): ReactNode {
  const [showOptions, setShowOptions] = useState(false);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');

  const handleExport = (): void => {
    // Apply filters
    let filtered = transactions;

    // Filter by date range
    const dateRange = getDateRangeFromPreset(datePreset);
    filtered = filterTransactionsByDateRange(filtered, dateRange);

    // Filter by type
    filtered = filterTransactionsByType(filtered, typeFilter);

    // Export to CSV
    exportTransactionsToCSV(filtered, publicKey);

    // Close options
    setShowOptions(false);
  };

  // Count filtered transactions for UI feedback
  const getFilteredCount = (): number => {
    let filtered = transactions;
    const dateRange = getDateRangeFromPreset(datePreset);
    filtered = filterTransactionsByDateRange(filtered, dateRange);
    filtered = filterTransactionsByType(filtered, typeFilter);
    return filtered.length;
  };

  const filteredCount = getFilteredCount();

  return (
    <div className="relative">
      <button
        onClick={() => setShowOptions(!showOptions)}
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm',
          'transition-colors hover:bg-accent',
          showOptions && 'bg-accent',
        )}
      >
        <Download size={16} />
        Export CSV
        <ChevronDown
          size={14}
          className={cn('transition-transform', showOptions && 'rotate-180')}
        />
      </button>

      {showOptions && (
        <>
          {/* Backdrop to close options when clicking outside */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowOptions(false)}
          />

          {/* Options dropdown */}
          <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-border bg-card shadow-lg">
            <div className="p-4 space-y-4">
              {/* Date Range Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Date Range
                </label>
                <div className="space-y-1">
                  {(['all', '7d', '30d', '90d'] as DateRangePreset[]).map(
                    preset => (
                      <label
                        key={preset}
                        className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded p-2"
                      >
                        <input
                          type="radio"
                          name="dateRange"
                          value={preset}
                          checked={datePreset === preset}
                          onChange={() => setDatePreset(preset)}
                          className="cursor-pointer"
                        />
                        <span className="text-sm">
                          {getPresetLabel(preset)}
                        </span>
                      </label>
                    ),
                  )}
                </div>
              </div>

              {/* Transaction Type Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Transaction Type
                </label>
                <div className="space-y-1">
                  {(
                    [
                      'all',
                      'sent',
                      'received',
                      'zkapp',
                    ] as TransactionTypeFilter[]
                  ).map(type => (
                    <label
                      key={type}
                      className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded p-2"
                    >
                      <input
                        type="radio"
                        name="typeFilter"
                        value={type}
                        checked={typeFilter === type}
                        onChange={() => setTypeFilter(type)}
                        className="cursor-pointer"
                      />
                      <span className="text-sm capitalize">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Export Info */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-3">
                  {filteredCount} transaction{filteredCount !== 1 ? 's' : ''}{' '}
                  will be exported
                </p>
                <button
                  onClick={handleExport}
                  disabled={filteredCount === 0}
                  className={cn(
                    'w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                    'transition-colors',
                    filteredCount === 0
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  <Download size={16} />
                  Download CSV
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
