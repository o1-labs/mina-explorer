import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { formatHash, formatAddress } from '@/utils/formatters';
import { cn } from '@/lib/utils';

interface HashLinkProps {
  hash: string;
  type: 'block' | 'transaction' | 'account';
  /** Override the link target (e.g., use block height instead of hash) */
  linkTo?: string;
  truncate?: boolean;
  prefixLength?: number;
  showCopy?: boolean;
}

export function HashLink({
  hash,
  type,
  linkTo,
  truncate = true,
  prefixLength = 8,
  showCopy = true,
}: HashLinkProps): ReactNode {
  const [copied, setCopied] = useState(false);

  const pathMap = {
    block: `/block/${hash}`,
    transaction: `/tx/${hash}`,
    account: `/account/${hash}`,
  };

  const linkPath = linkTo || pathMap[type];

  const displayText =
    truncate && type === 'account'
      ? formatAddress(hash, prefixLength)
      : truncate
        ? formatHash(hash, prefixLength)
        : hash;

  const handleCopy = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <Link to={linkPath} className="font-mono text-primary hover:underline">
        {displayText}
      </Link>
      {showCopy && (
        <button
          onClick={handleCopy}
          className={cn(
            'inline-flex items-center justify-center rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            copied && 'text-green-600 dark:text-green-400',
          )}
          title={copied ? 'Copied!' : 'Copy to clipboard'}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </span>
  );
}
