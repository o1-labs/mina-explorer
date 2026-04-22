import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ExternalLink } from 'lucide-react';
import { HashLink, LoadingSpinner } from '@/components/common';
import { formatTimeAgo } from '@/utils/formatters';
import { getClient } from '@/services/api/client';
import { useNetwork } from '@/hooks';

interface ZkAppActivity {
  hash: string;
  feePayer: string;
  affectedAccounts: string[];
  memo: string;
  blockHeight: number;
  dateTime: string;
}

interface ZkAppSummary {
  publicKey: string;
  lastActivity: string;
  transactionCount: number;
  latestTxHash: string;
}

// Nested schema (daemon endpoints)
const ZKAPP_ACTIVITY_QUERY_NESTED = `
  query GetZkAppActivity($limit: Int!) {
    blocks(
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
      blockHeight
      dateTime
      transactions {
        zkappCommands {
          hash
          zkappCommand {
            memo
            feePayer {
              body {
                publicKey
              }
            }
            accountUpdates {
              body {
                publicKey
              }
            }
          }
        }
      }
    }
  }
`;

// Flat schema (archive with ENABLE_BLOCK_TRANSACTION_DETAILS)
const ZKAPP_ACTIVITY_QUERY_FLAT = `
  query GetZkAppActivityFlat($limit: Int!) {
    blocks(
      limit: $limit
      sortBy: BLOCKHEIGHT_DESC
    ) {
      blockHeight
      dateTime
      transactions {
        zkappCommands {
          hash
          feePayer
          fee
          memo
        }
      }
    }
  }
`;

interface ZkAppActivityNestedResponse {
  blocks: Array<{
    blockHeight: number;
    dateTime: string;
    transactions: {
      zkappCommands: Array<{
        hash: string;
        zkappCommand: {
          memo: string;
          feePayer: {
            body: {
              publicKey: string;
            };
          };
          accountUpdates: Array<{
            body: {
              publicKey: string;
            };
          }>;
        };
      }>;
    };
  }>;
}

interface ZkAppActivityFlatResponse {
  blocks: Array<{
    blockHeight: number;
    dateTime: string;
    transactions: {
      zkappCommands: Array<{
        hash: string;
        feePayer: string;
        fee: string;
        memo: string;
      }>;
    };
  }>;
}

export function ZkAppsPage(): ReactNode {
  const [activities, setActivities] = useState<ZkAppActivity[]>([]);
  const [zkApps, setZkApps] = useState<ZkAppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();

  useEffect(() => {
    async function fetchZkAppActivity(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const client = getClient();
        const allActivities: ZkAppActivity[] = [];

        // Helper to extract from nested schema
        const extractNested = (data: ZkAppActivityNestedResponse): void => {
          for (const block of data.blocks) {
            for (const cmd of block.transactions.zkappCommands || []) {
              const affectedAccounts = cmd.zkappCommand.accountUpdates
                .map(u => u.body.publicKey)
                .filter((pk, idx, arr) => arr.indexOf(pk) === idx);

              allActivities.push({
                hash: cmd.hash,
                feePayer: cmd.zkappCommand.feePayer.body.publicKey,
                affectedAccounts,
                memo: cmd.zkappCommand.memo,
                blockHeight: block.blockHeight,
                dateTime: block.dateTime,
              });
            }
          }
        };

        // Helper to extract from flat schema
        const extractFlat = (data: ZkAppActivityFlatResponse): void => {
          for (const block of data.blocks) {
            for (const cmd of block.transactions.zkappCommands || []) {
              allActivities.push({
                hash: cmd.hash,
                feePayer: cmd.feePayer,
                affectedAccounts: [],
                memo: cmd.memo,
                blockHeight: block.blockHeight,
                dateTime: block.dateTime,
              });
            }
          }
        };

        // Fallback chain: nested → flat → error
        try {
          const data = await client.query<ZkAppActivityNestedResponse>(
            ZKAPP_ACTIVITY_QUERY_NESTED,
            { limit: 500 },
          );
          extractNested(data);
        } catch (nestedError) {
          const errorMessage =
            nestedError instanceof Error ? nestedError.message : '';
          if (
            errorMessage.includes('zkappCommands') ||
            errorMessage.includes('Cannot query field')
          ) {
            // Try flat schema
            try {
              const data = await client.query<ZkAppActivityFlatResponse>(
                ZKAPP_ACTIVITY_QUERY_FLAT,
                { limit: 500 },
              );
              extractFlat(data);
            } catch {
              setActivities([]);
              setZkApps([]);
              setError(
                'zkApp data is not available on the current network endpoint. ' +
                  'Try switching to a different network or endpoint that supports zkApp queries.',
              );
              return;
            }
          } else {
            throw nestedError;
          }
        }

        setActivities(allActivities);

        // Aggregate by zkApp account (affected accounts that aren't just fee payers)
        const zkAppMap = new Map<
          string,
          { lastActivity: string; txCount: number; latestTxHash: string }
        >();

        for (const activity of allActivities) {
          // Include all affected accounts as potential zkApps
          for (const account of activity.affectedAccounts) {
            const existing = zkAppMap.get(account);
            if (!existing || activity.dateTime > existing.lastActivity) {
              zkAppMap.set(account, {
                lastActivity: activity.dateTime,
                txCount: (existing?.txCount || 0) + 1,
                latestTxHash: activity.hash,
              });
            } else {
              zkAppMap.set(account, {
                ...existing,
                txCount: existing.txCount + 1,
              });
            }
          }
        }

        // Convert to array and sort by activity
        const zkAppList: ZkAppSummary[] = Array.from(zkAppMap.entries())
          .map(([publicKey, data]) => ({
            publicKey,
            lastActivity: data.lastActivity,
            transactionCount: data.txCount,
            latestTxHash: data.latestTxHash,
          }))
          .sort(
            (a, b) =>
              new Date(b.lastActivity).getTime() -
              new Date(a.lastActivity).getTime(),
          )
          .slice(0, 50); // Top 50 most recently active

        setZkApps(zkAppList);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch zkApp activity',
        );
      } finally {
        setLoading(false);
      }
    }

    fetchZkAppActivity();
  }, [network.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">zkApp Explorer</h1>
        <p className="mt-1 text-muted-foreground">
          Browse recently active zkApps and smart contracts on Mina
        </p>
      </div>

      {loading && <LoadingSpinner text="Loading zkApp activity..." />}

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-500/10 p-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Active zkApps
                  </div>
                  <div className="text-2xl font-semibold">{zkApps.length}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground">
                Recent Transactions
              </div>
              <div className="text-2xl font-semibold">{activities.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Last 500 blocks
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 sm:col-span-2 lg:col-span-1">
              <div className="text-sm text-muted-foreground">Network</div>
              <div className="text-2xl font-semibold">
                {network.displayName}
              </div>
              {network.isTestnet && (
                <span className="mt-1 inline-block rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">
                  Testnet
                </span>
              )}
            </div>
          </div>

          {/* zkApps Table */}
          {zkApps.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold">No zkApp Activity Found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                No zkApp transactions found in recent blocks on this network.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">zkApp Account</th>
                    <th className="px-4 py-3">Last Activity</th>
                    <th className="px-4 py-3 text-right">Transactions</th>
                    <th className="px-4 py-3">Latest Tx</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {zkApps.map(zkApp => (
                    <tr
                      key={zkApp.publicKey}
                      className="transition-colors hover:bg-accent/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/10">
                            <Sparkles className="h-4 w-4 text-purple-500" />
                          </div>
                          <HashLink hash={zkApp.publicKey} type="account" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatTimeAgo(zkApp.lastActivity)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {zkApp.transactionCount}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/transaction/${zkApp.latestTxHash}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {zkApp.latestTxHash.slice(0, 12)}...
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/account/${zkApp.publicKey}`}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-accent"
                        >
                          View Details
                          <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Activity */}
          {activities.length > 0 && (
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-6 py-4">
                <h3 className="font-semibold">Recent zkApp Transactions</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Latest {Math.min(activities.length, 10)} zkApp commands
                </p>
              </div>
              <div className="divide-y divide-border">
                {activities.slice(0, 10).map(activity => (
                  <div
                    key={activity.hash}
                    className="flex items-center gap-4 px-6 py-4"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10">
                      <Sparkles className="h-5 w-5 text-purple-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/transaction/${activity.hash}`}
                          className="font-mono text-sm text-primary hover:underline"
                        >
                          {activity.hash.slice(0, 20)}...
                        </Link>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Fee payer:</span>
                        <HashLink hash={activity.feePayer} type="account" />
                        <span>·</span>
                        <span>
                          {activity.affectedAccounts.length} account
                          {activity.affectedAccounts.length !== 1
                            ? 's'
                            : ''}{' '}
                          affected
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <Link
                        to={`/block/${activity.blockHeight}`}
                        className="hover:text-foreground"
                      >
                        Block #{activity.blockHeight.toLocaleString()}
                      </Link>
                      <div className="text-xs">
                        {formatTimeAgo(activity.dateTime)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
