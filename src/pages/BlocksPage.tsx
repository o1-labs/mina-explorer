import type { ReactNode } from 'react';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { usePaginatedBlocks, useNetwork } from '@/hooks';
import { BlockList } from '@/components/blocks';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/utils/formatters';
import { generatePageNumbers } from '@/utils/pagination';

export function BlocksPage(): ReactNode {
  const { network } = useNetwork();
  const {
    blocks,
    loading,
    error,
    page,
    totalPages,
    totalBlockHeight,
    goToPage,
    nextPage,
    prevPage,
    refresh,
  } = usePaginatedBlocks(25);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Blocks</h1>
          {totalBlockHeight > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatNumber(totalBlockHeight)} total blocks on{' '}
              {network.displayName}
            </p>
          )}
        </div>
        <button
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent',
            loading && 'opacity-50',
          )}
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <BlockList blocks={blocks} loading={loading} error={error} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Page {page} of {formatNumber(totalPages)}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(1)}
              disabled={page === 1 || loading}
              className={cn(
                'p-2 rounded-md transition-colors',
                page === 1 || loading
                  ? 'text-muted-foreground/50 cursor-not-allowed'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
              title="First page"
            >
              <ChevronsLeft size={18} />
            </button>
            <button
              onClick={prevPage}
              disabled={page === 1 || loading}
              className={cn(
                'p-2 rounded-md transition-colors',
                page === 1 || loading
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
                    disabled={loading}
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
              disabled={page === totalPages || loading}
              className={cn(
                'p-2 rounded-md transition-colors',
                page === totalPages || loading
                  ? 'text-muted-foreground/50 cursor-not-allowed'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
              title="Next page"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={page === totalPages || loading}
              className={cn(
                'p-2 rounded-md transition-colors',
                page === totalPages || loading
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
    </div>
  );
}
