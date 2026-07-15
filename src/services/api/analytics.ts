/**
 * Analytics API Service
 * Provides aggregated statistics about network activity
 */

import { getClient } from './client';

/**
 * Maximum number of blocks fetched per analytics query. On busy networks a
 * long period (e.g. 30 days on mainnet) contains far more blocks than this,
 * so the fetched blocks may cover only the most recent slice of the selected
 * period. Stats must then be computed and labeled over the covered range.
 */
export const ANALYTICS_BLOCK_LIMIT = 2000;

export interface BlockStats {
  height: number;
  dateTime: string;
  txCount: number;
  zkappCount: number;
  totalFees: string;
}

export interface DailyStats {
  date: string;
  blockCount: number;
  txCount: number;
  zkappCount: number;
  totalFees: bigint;
  avgBlockTime: number; // in seconds
}

export interface NetworkAnalytics {
  dailyStats: DailyStats[];
  totalBlocks: number;
  totalTxCount: number;
  totalZkappCount: number;
  avgBlockTime: number;
  avgTps: number;
  avgFee: string;
  period: string;
  /** True when the block cap truncated the selected period. */
  truncated: boolean;
  /** Duration actually covered by the fetched blocks, in seconds. */
  coveredSeconds: number;
  /** Human label for the covered duration (e.g. '5.0 days', '18.2 hours'). */
  coveredLabel: string;
}

// Query to fetch blocks with transaction counts for analytics
const BLOCKS_ANALYTICS_QUERY = `
  query BlocksAnalytics($limit: Int, $dateTime_gte: DateTime) {
    blocks(
      query: { canonical: true, dateTime_gte: $dateTime_gte }
      sortBy: BLOCKHEIGHT_DESC
      limit: $limit
    ) {
      blockHeight
      dateTime
      txFees
      transactions {
        userCommands {
          hash
        }
        zkappCommands {
          hash
        }
      }
    }
  }
`;

// Fallback query without txFees (archive may not support it) but keeps zkApp counts
const BLOCKS_ANALYTICS_QUERY_BASIC = `
  query BlocksAnalyticsBasic($limit: Int, $dateTime_gte: DateTime) {
    blocks(
      query: { canonical: true, dateTime_gte: $dateTime_gte }
      sortBy: BLOCKHEIGHT_DESC
      limit: $limit
    ) {
      blockHeight
      dateTime
      transactions {
        userCommands {
          hash
        }
        zkappCommands {
          hash
        }
      }
    }
  }
`;

// Minimal query without txFees or userCommands (for archive nodes with limited schema)
const BLOCKS_ANALYTICS_QUERY_MINIMAL = `
  query BlocksAnalyticsMinimal($limit: Int, $dateTime_gte: DateTime) {
    blocks(
      query: { dateTime_gte: $dateTime_gte }
      sortBy: BLOCKHEIGHT_DESC
      limit: $limit
    ) {
      blockHeight
      dateTime
      transactions {
        coinbase
      }
    }
  }
`;

interface BlockAnalyticsData {
  blocks: Array<{
    blockHeight: number;
    dateTime: string;
    txFees?: string;
    transactions: {
      coinbase?: string;
      userCommands?: Array<{ hash: string }>;
      zkappCommands?: Array<{ hash: string }>;
    };
  }>;
}

/**
 * Fetch blocks for analytics over a time period
 */
export async function fetchBlocksForAnalytics(
  days: number = 7,
): Promise<BlockStats[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const client = getClient();

  let response: BlockAnalyticsData;
  try {
    response = await client.query<BlockAnalyticsData>(BLOCKS_ANALYTICS_QUERY, {
      limit: ANALYTICS_BLOCK_LIMIT,
      dateTime_gte: startDate.toISOString(),
    });
  } catch {
    // Fall back to basic query without zkappCommands
    try {
      response = await client.query<BlockAnalyticsData>(
        BLOCKS_ANALYTICS_QUERY_BASIC,
        {
          limit: ANALYTICS_BLOCK_LIMIT,
          dateTime_gte: startDate.toISOString(),
        },
      );
    } catch {
      // Fall back to minimal query (archive nodes without txFees/userCommands)
      console.log(
        '[Analytics] Using minimal query - transaction data not available',
      );
      response = await client.query<BlockAnalyticsData>(
        BLOCKS_ANALYTICS_QUERY_MINIMAL,
        {
          limit: ANALYTICS_BLOCK_LIMIT,
          dateTime_gte: startDate.toISOString(),
        },
      );
    }
  }

  return response.blocks.map((block: BlockAnalyticsData['blocks'][0]) => ({
    height: block.blockHeight,
    dateTime: block.dateTime,
    txCount: block.transactions?.userCommands?.length || 0,
    zkappCount: block.transactions?.zkappCommands?.length || 0,
    totalFees: block.txFees || '0',
  }));
}

/**
 * Aggregate block stats into daily statistics
 */
export function aggregateDailyStats(blocks: BlockStats[]): DailyStats[] {
  const dailyMap = new Map<
    string,
    {
      blocks: BlockStats[];
      totalFees: bigint;
    }
  >();

  // Group blocks by date
  for (const block of blocks) {
    const date = block.dateTime.split('T')[0];
    const existing = dailyMap.get(date);
    const fees = BigInt(block.totalFees || '0');

    if (existing) {
      existing.blocks.push(block);
      existing.totalFees += fees;
    } else {
      dailyMap.set(date, { blocks: [block], totalFees: fees });
    }
  }

  // Convert to DailyStats array
  const dailyStats: DailyStats[] = [];

  for (const [date, data] of dailyMap.entries()) {
    const sortedBlocks = data.blocks.sort(
      (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
    );

    // Calculate average block time
    let totalBlockTime = 0;
    for (let i = 1; i < sortedBlocks.length; i++) {
      const timeDiff =
        new Date(sortedBlocks[i].dateTime).getTime() -
        new Date(sortedBlocks[i - 1].dateTime).getTime();
      totalBlockTime += timeDiff / 1000; // Convert to seconds
    }
    const avgBlockTime =
      sortedBlocks.length > 1 ? totalBlockTime / (sortedBlocks.length - 1) : 0;

    const txCount = data.blocks.reduce((sum, b) => sum + b.txCount, 0);
    const zkappCount = data.blocks.reduce((sum, b) => sum + b.zkappCount, 0);

    dailyStats.push({
      date,
      blockCount: data.blocks.length,
      txCount,
      zkappCount,
      totalFees: data.totalFees,
      avgBlockTime: Math.round(avgBlockTime),
    });
  }

  // Sort by date (oldest first for charts)
  return dailyStats.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Format a duration in seconds as a human-readable label.
 */
function formatCoveredDuration(seconds: number): string {
  const days = seconds / 86400;
  if (days >= 1) {
    return `${days.toFixed(1)} days`;
  }
  return `${(seconds / 3600).toFixed(1)} hours`;
}

/**
 * Calculate network analytics from block data
 */
export function calculateNetworkAnalytics(
  blocks: BlockStats[],
  periodDays: number,
): NetworkAnalytics {
  const periodSeconds = periodDays * 24 * 60 * 60;

  if (blocks.length === 0) {
    return {
      dailyStats: [],
      totalBlocks: 0,
      totalTxCount: 0,
      totalZkappCount: 0,
      avgBlockTime: 0,
      avgTps: 0,
      avgFee: '0',
      period: `${periodDays} days`,
      truncated: false,
      coveredSeconds: 0,
      coveredLabel: `${periodDays} days`,
    };
  }

  let dailyStats = aggregateDailyStats(blocks);

  const totalBlocks = blocks.length;
  const totalTxCount = blocks.reduce((sum, b) => sum + b.txCount, 0);
  const totalZkappCount = blocks.reduce((sum, b) => sum + b.zkappCount, 0);
  const totalFees = blocks.reduce(
    (sum, b) => sum + BigInt(b.totalFees || '0'),
    BigInt(0),
  );

  // Calculate average block time from sorted blocks
  const sortedBlocks = [...blocks].sort(
    (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
  );

  let totalBlockTime = 0;
  for (let i = 1; i < sortedBlocks.length; i++) {
    const timeDiff =
      new Date(sortedBlocks[i].dateTime).getTime() -
      new Date(sortedBlocks[i - 1].dateTime).getTime();
    totalBlockTime += timeDiff / 1000;
  }
  const avgBlockTime =
    sortedBlocks.length > 1 ? totalBlockTime / (sortedBlocks.length - 1) : 0;

  // The query is capped at ANALYTICS_BLOCK_LIMIT blocks. If the cap was hit
  // and the fetched blocks span meaningfully less than the selected period,
  // the period was silently truncated: stats must be computed over the range
  // the blocks actually cover, not the full period (#87).
  const spanSeconds = Math.max(
    0,
    (new Date(sortedBlocks[sortedBlocks.length - 1].dateTime).getTime() -
      new Date(sortedBlocks[0].dateTime).getTime()) /
      1000,
  );
  const truncated =
    blocks.length >= ANALYTICS_BLOCK_LIMIT &&
    spanSeconds < periodSeconds * 0.98;
  const coveredSeconds = truncated ? spanSeconds : periodSeconds;

  if (truncated && dailyStats.length > 1) {
    // The oldest day is cut mid-day by the block cap — drop the partial
    // bucket so it does not render as a plausible full-day bar.
    dailyStats = dailyStats.slice(1);
  }

  // Calculate TPS (transactions per second) over the covered range
  const avgTps = coveredSeconds > 0 ? totalTxCount / coveredSeconds : 0;

  // Calculate average fee per transaction
  const avgFee =
    totalTxCount > 0 ? (totalFees / BigInt(totalTxCount)).toString() : '0';

  return {
    dailyStats,
    totalBlocks,
    totalTxCount,
    totalZkappCount,
    avgBlockTime: Math.round(avgBlockTime),
    avgTps,
    avgFee,
    period: `${periodDays} days`,
    truncated,
    coveredSeconds,
    coveredLabel: truncated
      ? formatCoveredDuration(coveredSeconds)
      : `${periodDays} days`,
  };
}
