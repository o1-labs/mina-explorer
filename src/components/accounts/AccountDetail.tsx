import { useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  HashLink,
  Amount,
  LoadingSpinner,
  CopyButton,
} from '@/components/common';
import { cn } from '@/lib/utils';
import type { Account } from '@/types';

interface AccountDetailProps {
  account: Account | null;
  loading: boolean;
  error: string | null;
  networkName?: string;
  networkId?: string;
}

// Map network IDs to MinaScan network slugs
function getMinaScanNetwork(networkId?: string): string {
  switch (networkId) {
    case 'mainnet':
      return 'mainnet';
    case 'devnet':
    case 'mesa':
    case 'pre-mesa':
      return 'devnet';
    default:
      return 'mainnet';
  }
}

export function AccountDetail({
  account,
  loading,
  error,
  networkName,
  networkId,
}: AccountDetailProps): ReactNode {
  const [showJson, setShowJson] = useState(false);

  if (loading) {
    return <LoadingSpinner text="Loading account..." />;
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!account) {
    return (
      <div className="rounded-md bg-warning/10 p-4 text-sm text-warning">
        <p className="font-medium">
          Account not found on {networkName || 'this network'}.
        </p>
        <p className="mt-1 text-warning/80">
          This account may exist on a different network. Try switching networks
          using the selector in the header.
        </p>
      </div>
    );
  }

  const isZkApp = account.zkappState && account.zkappState.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Account</h2>
          {isZkApp && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              zkApp
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`https://minascan.io/${getMinaScanNetwork(networkId)}/account/${account.publicKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm',
              'transition-colors hover:bg-accent',
            )}
          >
            See on MinaScan
            <ExternalLink size={14} />
          </a>
          <button
            className={cn(
              'rounded-md border border-input px-3 py-1.5 text-sm',
              'transition-colors hover:bg-accent',
            )}
            onClick={() => setShowJson(!showJson)}
          >
            {showJson ? 'Hide JSON' : 'View JSON'}
          </button>
        </div>
      </div>
      <div className="p-6">
        {showJson ? (
          <pre className="max-h-[600px] overflow-auto rounded-md bg-accent p-4 font-mono text-xs">
            {JSON.stringify(account, null, 2)}
          </pre>
        ) : (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="flex flex-col gap-1 border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">
                  Public Key
                </span>
                <div className="flex items-start gap-2">
                  <span className="break-all font-mono text-sm">
                    {account.publicKey}
                  </span>
                  <CopyButton text={account.publicKey} />
                </div>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-muted-foreground">Balance</span>
                <Amount value={account.balance.total} />
              </div>
              {account.balance.liquid && (
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-muted-foreground">Liquid Balance</span>
                  <Amount value={account.balance.liquid} />
                </div>
              )}
              {account.balance.locked && (
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-muted-foreground">Locked Balance</span>
                  <Amount value={account.balance.locked} />
                </div>
              )}
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-muted-foreground">Nonce</span>
                <span>{account.nonce}</span>
              </div>
              {account.delegate && (
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-muted-foreground">Delegate</span>
                  <HashLink hash={account.delegate} type="account" />
                </div>
              )}
              {account.tokenSymbol && (
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-muted-foreground">Token Symbol</span>
                  <span>{account.tokenSymbol}</span>
                </div>
              )}
              {account.zkappUri && (
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-muted-foreground">zkApp URI</span>
                  <a
                    href={account.zkappUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {account.zkappUri}
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}
            </div>

            {/* zkApp State */}
            {isZkApp && account.zkappState && (
              <div>
                <h3 className="mb-3 font-semibold">zkApp State</h3>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-accent/50">
                        <th className="w-20 px-4 py-2 text-left font-medium">
                          Index
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {account.zkappState.map((state, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2">{index}</td>
                          <td className="px-4 py-2">
                            <span className="break-all font-mono text-xs">
                              {state || '0'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Permissions */}
            {account.permissions && (
              <div>
                <h3 className="mb-3 font-semibold">Permissions</h3>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {Object.entries(account.permissions).map(([key, value]) => {
                    // Handle object values (e.g., setVerificationKey can be an object)
                    const displayValue =
                      typeof value === 'object' && value !== null
                        ? JSON.stringify(value)
                        : String(value);
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {key}:
                        </span>
                        <span className="rounded bg-accent px-2 py-0.5 text-xs font-medium">
                          {displayValue}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vesting Schedule */}
            {account.timing && (
              <div>
                <h3 className="mb-3 font-semibold">Vesting Schedule</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">
                      Initial Minimum Balance
                    </span>
                    {account.timing.initialMinimumBalance ? (
                      <Amount value={account.timing.initialMinimumBalance} />
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Cliff Time</span>
                    <span>{account.timing.cliffTime ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Cliff Amount</span>
                    {account.timing.cliffAmount ? (
                      <Amount value={account.timing.cliffAmount} />
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">
                      Vesting Period
                    </span>
                    <span>{account.timing.vestingPeriod ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">
                      Vesting Increment
                    </span>
                    {account.timing.vestingIncrement ? (
                      <Amount value={account.timing.vestingIncrement} />
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
