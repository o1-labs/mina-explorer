import type { ReactNode } from 'react';
import { useNetworkState, useNetwork, useEpochInfo } from '@/hooks';
import { formatNumber } from '@/utils/formatters';
import { LoadingSpinner } from '@/components/common';

// Mina has 7140 slots per epoch
const SLOTS_PER_EPOCH = 7140;

function StatCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-center">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export function NetworkStats(): ReactNode {
  const { networkState, loading, error } = useNetworkState();
  const { network } = useNetwork();
  const { epochInfo } = useEpochInfo();

  const epoch = epochInfo?.epoch;
  const slot = epochInfo?.slot;
  const slotProgress = slot
    ? ((slot / SLOTS_PER_EPOCH) * 100).toFixed(1)
    : null;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <LoadingSpinner size="sm" text="Loading network stats..." />
      </div>
    );
  }

  if (error || !networkState) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load network stats
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Network">
        <div className="flex items-center justify-center gap-2">
          <span className="font-semibold">{network.displayName}</span>
          {network.isTestnet && (
            <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">
              Testnet
            </span>
          )}
        </div>
      </StatCard>

      <StatCard label="Block Height">
        <div className="font-mono text-lg font-semibold text-primary">
          {formatNumber(networkState.maxBlockHeight.canonicalMaxBlockHeight)}
        </div>
      </StatCard>

      <StatCard label="Epoch">
        <div className="font-mono text-lg font-semibold text-primary">
          {epoch !== undefined ? formatNumber(epoch) : '-'}
        </div>
        {slot !== undefined && slotProgress && (
          <div className="mt-2">
            <div className="h-1 w-full rounded-full bg-secondary">
              <div
                className="h-1 rounded-full bg-green-500"
                style={{ width: `${slotProgress}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatNumber(slot)} / {formatNumber(SLOTS_PER_EPOCH)} slots
            </div>
          </div>
        )}
      </StatCard>

      <StatCard label="Pending Height">
        <div className="font-mono text-lg font-semibold">
          {formatNumber(networkState.maxBlockHeight.pendingMaxBlockHeight)}
        </div>
      </StatCard>
    </div>
  );
}
