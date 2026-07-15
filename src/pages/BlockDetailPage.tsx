import type { ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useBlock } from '@/hooks';
import { BlockDetail } from '@/components/blocks';
import { isValidBlockHash } from '@/utils/formatters';
import { BLOCK_HASH_SEARCH_WINDOW } from '@/services/api/blocks';

export function BlockDetailPage(): ReactNode {
  const { identifier } = useParams<{ identifier: string }>();
  const id = identifier || '';
  const { block, loading, error } = useBlock(id);

  // The archive can't look blocks up by hash (its query has no stateHash filter,
  // verified against the live endpoint), so a hash lookup only scans the most
  // recent BLOCK_HASH_SEARCH_WINDOW blocks. When a well-formed hash isn't found
  // there, say so honestly — it may be an older block that still exists — rather
  // than the bare "Block not found" that implies it doesn't. A genuine fetch
  // error (a non-"Block not found" message) falls through to BlockDetail.
  const hashNotFound =
    !loading &&
    !block &&
    isValidBlockHash(id) &&
    (!error || error === 'Block not found');
  const searchWindow = BLOCK_HASH_SEARCH_WINDOW.toLocaleString('en-US');

  return (
    <div className="space-y-4">
      <nav aria-label="breadcrumb">
        <ol className="flex items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <ChevronRight size={14} />
          <li>
            <Link to="/blocks" className="hover:text-foreground">
              Blocks
            </Link>
          </li>
          <ChevronRight size={14} />
          <li className="font-medium text-foreground">{identifier}</li>
        </ol>
      </nav>

      {hashNotFound ? (
        <div className="space-y-4">
          <div className="rounded-md bg-yellow-500/10 p-4">
            <h3 className="font-semibold text-yellow-700 dark:text-yellow-400">
              Block Not Found
            </h3>
            <p className="mt-2 text-sm text-yellow-600 dark:text-yellow-300">
              This block hash wasn&apos;t found in the most recent{' '}
              {searchWindow} blocks.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h4 className="font-medium">Why this can happen</h4>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>
                This endpoint can&apos;t look blocks up by hash, so only the
                most recent {searchWindow} blocks are searched — an older block
                won&apos;t be found even though it exists on-chain.
              </li>
              <li>The state hash may be incorrect or incomplete.</li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              If you know the block height, search by height instead — any block
              is reachable that way.{' '}
              <Link to="/blocks" className="text-primary hover:underline">
                Browse recent blocks
              </Link>
              .
            </p>
          </div>
        </div>
      ) : (
        <BlockDetail block={block} loading={loading} error={error} />
      )}
    </div>
  );
}
