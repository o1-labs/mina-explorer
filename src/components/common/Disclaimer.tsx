import { type ReactNode, useState } from 'react';

const DISMISSED_KEY = 'mina-explorer-disclaimer-dismissed';

export function Disclaimer(): ReactNode {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true',
  );

  if (dismissed) return null;

  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
      <div className="container mx-auto flex items-start justify-between gap-4">
        <div>
          <p>
            <strong>Note:</strong> This explorer is an active development
            project. Uptime and API availability are not currently guaranteed.
          </p>
          <p className="mt-1 text-muted-foreground">
            If you&apos;re building production services or integrations that
            require reliable API access, please use established third-party
            explorers like{' '}
            <a
              href="https://minascan.io/mainnet/home"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline hover:text-foreground"
            >
              Minascan
            </a>
            . Found a bug or have feedback?{' '}
            <a
              href="https://github.com/o1-labs/mina-explorer/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline hover:text-foreground"
            >
              Open an issue on GitHub
            </a>
            .
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, 'true');
            setDismissed(true);
          }}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Dismiss disclaimer"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
