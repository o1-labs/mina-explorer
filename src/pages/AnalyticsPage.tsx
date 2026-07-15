import type { ReactNode } from 'react';
import { Activity, Layers, Zap, Clock, DollarSign, Users } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { LoadingSpinner } from '@/components/common';
import { useAnalytics, type AnalyticsPeriod } from '@/hooks';
import { formatMina, formatNumber } from '@/utils/formatters';
import { cn } from '@/lib/utils';

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

export function AnalyticsPage(): ReactNode {
  const { analytics, loading, error, period, setPeriod } = useAnalytics();

  // When the block cap truncates the selected period, every label must show
  // the range the stats actually cover — no silent truncation (#87).
  const rangeLabel = analytics?.truncated
    ? `last ${analytics.coveredLabel}`
    : (analytics?.period ?? '');
  const chartRangeSuffix = analytics?.truncated
    ? ` (last ${analytics.coveredLabel})`
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Network Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            Track network activity and performance over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Period:</span>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => setPeriod(option.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  period === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-accent',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <LoadingSpinner text="Loading analytics..." />}

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {analytics && !loading && (
        <>
          {/* Coverage notice when the block cap truncates the period */}
          {analytics.truncated && (
            <div
              data-testid="analytics-coverage-notice"
              className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground"
            >
              Showing the most recent {analytics.coveredLabel} of the selected{' '}
              {analytics.period} — the query returns at most the newest blocks
              in the period. All totals, charts, and TPS below cover only this
              range.
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={Layers}
              label="Total Blocks"
              value={formatNumber(analytics.totalBlocks)}
              description={`In ${rangeLabel}`}
            />
            <StatCard
              icon={Activity}
              label="Total Transactions"
              value={formatNumber(analytics.totalTxCount)}
              description={`User commands`}
            />
            <StatCard
              icon={Zap}
              label="zkApp Commands"
              value={formatNumber(analytics.totalZkappCount)}
              description={`Smart contract calls`}
            />
            <StatCard
              icon={Clock}
              label="Avg Block Time"
              value={`${analytics.avgBlockTime}s`}
              description="Time between blocks"
            />
            <StatCard
              icon={Users}
              label="TPS"
              value={analytics.avgTps.toFixed(4)}
              description={
                analytics.truncated
                  ? `Transactions per second over ${rangeLabel}`
                  : 'Transactions per second'
              }
            />
            <StatCard
              icon={DollarSign}
              label="Avg Fee"
              value={formatMina(analytics.avgFee)}
              description="Per transaction"
            />
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Block Production Chart */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="mb-4 font-semibold">
                Block Production{chartRangeSuffix}
              </h3>
              <div className="h-[300px]">
                {analytics.dailyStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.dailyStats}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={formatDateLabel}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelFormatter={formatTooltipDate}
                      />
                      <Area
                        type="monotone"
                        dataKey="blockCount"
                        name="Blocks"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary) / 0.2)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </div>
            </div>

            {/* Transaction Volume Chart */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="mb-4 font-semibold">
                Transaction Volume{chartRangeSuffix}
              </h3>
              <div className="h-[300px]">
                {analytics.dailyStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.dailyStats}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={formatDateLabel}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelFormatter={formatTooltipDate}
                      />
                      <Legend />
                      <Bar
                        dataKey="txCount"
                        name="User Commands"
                        fill="hsl(217 91% 60%)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="zkappCount"
                        name="zkApp Commands"
                        fill="hsl(262 83% 58%)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </div>
            </div>

            {/* Average Block Time Chart */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="mb-4 font-semibold">
                Average Block Time{chartRangeSuffix}
              </h3>
              <div className="h-[300px]">
                {analytics.dailyStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.dailyStats}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={formatDateLabel}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                        unit="s"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelFormatter={formatTooltipDate}
                        formatter={formatBlockTime}
                      />
                      <Area
                        type="monotone"
                        dataKey="avgBlockTime"
                        name="Block Time"
                        stroke="hsl(142 71% 45%)"
                        fill="hsl(142 71% 45% / 0.2)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </div>
            </div>

            {/* Daily Stats Table */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="mb-4 font-semibold">
                Daily Summary{chartRangeSuffix}
              </h3>
              <div className="max-h-[300px] overflow-auto">
                {analytics.dailyStats.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="pb-2 font-medium text-muted-foreground">
                          Date
                        </th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">
                          Blocks
                        </th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">
                          Txs
                        </th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">
                          zkApps
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...analytics.dailyStats].reverse().map(day => (
                        <tr key={day.date} className="border-b border-border">
                          <td className="py-2">
                            {formatTooltipDate(day.date)}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatNumber(day.blockCount)}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatNumber(day.txCount)}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatNumber(day.zkappCount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  description: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  description,
}: StatCardProps): ReactNode {
  return (
    <div
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={16} />
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

function formatDateLabel(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Tooltip label formatter for recharts - accepts ReactNode but we only use strings
function formatTooltipDate(label: unknown): string {
  if (typeof label !== 'string') return '';
  const d = new Date(label);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Tooltip value formatter for block time
function formatBlockTime(value: unknown): [string, string] {
  if (typeof value !== 'number') return ['N/A', 'Avg Time'];
  return [`${value}s`, 'Avg Time'];
}
