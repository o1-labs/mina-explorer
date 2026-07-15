// MINA Price Service
// Uses CoinGecko API (free, no API key required)
// API Documentation: https://www.coingecko.com/api/documentation
//
// Endpoints used:
// - Current price: GET https://api.coingecko.com/api/v3/simple/price?ids=mina-protocol&vs_currencies=usd,eur&include_24hr_change=true
// - Historical price: GET https://api.coingecko.com/api/v3/coins/mina-protocol/history?date=DD-MM-YYYY

import { getStoredItem, setStoredItem } from '@/lib/safeStorage';
import { parseNanomina } from '@/utils/formatters';
import { fetchWithTimeout } from './http';

const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const MINA_COIN_ID = 'mina-protocol';

// Cache duration in milliseconds
const CURRENT_PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
// Note: Historical prices don't expire since they're immutable

export interface MINAPrice {
  usd: number;
  eur: number;
  usd_24h_change: number | null;
  eur_24h_change: number | null;
  lastUpdated: number;
}

export interface HistoricalPrice {
  usd: number;
  eur: number;
  date: string;
}

// In-memory cache for current price
let currentPriceCache: MINAPrice | null = null;

// A single in-flight request shared by all concurrent callers. Without this, a
// page full of <Amount> components (each reading the price) would fire one
// CoinGecko request apiece on a cold cache and get rate-limited. Cleared once
// the request settles so the next refresh can fetch again.
let inFlightPriceRequest: Promise<MINAPrice> | null = null;

// In-memory cache for historical prices (keyed by date string DD-MM-YYYY)
const historicalPriceCache = new Map<string, HistoricalPrice>();

// LocalStorage keys
const CURRENT_PRICE_STORAGE_KEY = 'mina_price_current';
const HISTORICAL_PRICE_STORAGE_KEY = 'mina_price_historical';

function loadCacheFromStorage(): void {
  try {
    // Load current price from localStorage
    const storedCurrent = getStoredItem(CURRENT_PRICE_STORAGE_KEY);
    if (storedCurrent) {
      const parsed = JSON.parse(storedCurrent) as MINAPrice;
      if (Date.now() - parsed.lastUpdated < CURRENT_PRICE_CACHE_DURATION) {
        currentPriceCache = parsed;
      }
    }

    // Load historical prices from localStorage
    const storedHistorical = getStoredItem(HISTORICAL_PRICE_STORAGE_KEY);
    if (storedHistorical) {
      const parsed = JSON.parse(storedHistorical) as Record<
        string,
        HistoricalPrice
      >;
      for (const [date, price] of Object.entries(parsed)) {
        historicalPriceCache.set(date, price);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

function saveCacheToStorage(): void {
  try {
    if (currentPriceCache) {
      setStoredItem(
        CURRENT_PRICE_STORAGE_KEY,
        JSON.stringify(currentPriceCache),
      );
    }

    if (historicalPriceCache.size > 0) {
      const obj: Record<string, HistoricalPrice> = {};
      historicalPriceCache.forEach((value, key) => {
        obj[key] = value;
      });
      setStoredItem(HISTORICAL_PRICE_STORAGE_KEY, JSON.stringify(obj));
    }
  } catch {
    // Ignore storage errors
  }
}

// Initialize cache from storage
loadCacheFromStorage();

/**
 * Fetch current MINA price in USD and EUR
 * Uses CoinGecko simple/price endpoint
 */
export async function fetchCurrentPrice(options?: {
  forceRefresh?: boolean;
}): Promise<MINAPrice> {
  // Serve a fresh cached price without touching the network, unless the caller
  // explicitly wants fresh data (e.g. the provider's scheduled refresh).
  if (
    !options?.forceRefresh &&
    currentPriceCache &&
    Date.now() - currentPriceCache.lastUpdated < CURRENT_PRICE_CACHE_DURATION
  ) {
    return currentPriceCache;
  }

  // Coalesce concurrent callers onto one network request. A forced refresh
  // still joins an in-flight request — it is already fetching fresh data.
  if (inFlightPriceRequest) {
    return inFlightPriceRequest;
  }

  inFlightPriceRequest = requestCurrentPrice().finally(() => {
    inFlightPriceRequest = null;
  });
  return inFlightPriceRequest;
}

/**
 * Perform the actual CoinGecko current-price fetch and update the cache. Kept
 * separate from fetchCurrentPrice so the caching / in-flight-dedup logic stays
 * readable; callers should go through fetchCurrentPrice.
 */
async function requestCurrentPrice(): Promise<MINAPrice> {
  const url = `${COINGECKO_API_BASE}/simple/price?ids=${MINA_COIN_ID}&vs_currencies=usd,eur&include_24hr_change=true`;

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch price: ${response.status}`);
  }

  const data = (await response.json()) as {
    [key: string]: {
      usd: number;
      eur: number;
      usd_24h_change?: number;
      eur_24h_change?: number;
    };
  };

  const minaData = data[MINA_COIN_ID];
  if (!minaData) {
    throw new Error('MINA price data not found in response');
  }

  const price: MINAPrice = {
    usd: minaData.usd,
    eur: minaData.eur,
    usd_24h_change: minaData.usd_24h_change ?? null,
    eur_24h_change: minaData.eur_24h_change ?? null,
    lastUpdated: Date.now(),
  };

  // Update cache
  currentPriceCache = price;
  saveCacheToStorage();

  return price;
}

/**
 * Format date for CoinGecko API (DD-MM-YYYY)
 */
function formatDateForAPI(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Fetch historical MINA price for a specific date
 * Uses CoinGecko coins/history endpoint
 */
export async function fetchHistoricalPrice(
  date: Date,
): Promise<HistoricalPrice> {
  const dateStr = formatDateForAPI(date);

  // Check cache first
  const cached = historicalPriceCache.get(dateStr);
  if (cached) {
    return cached;
  }

  const url = `${COINGECKO_API_BASE}/coins/${MINA_COIN_ID}/history?date=${dateStr}`;

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch historical price: ${response.status}`);
  }

  const data = (await response.json()) as {
    market_data?: {
      current_price?: {
        usd?: number;
        eur?: number;
      };
    };
  };

  const marketData = data.market_data?.current_price;
  if (!marketData || marketData.usd === undefined) {
    throw new Error('Historical price data not found');
  }

  const price: HistoricalPrice = {
    usd: marketData.usd ?? 0,
    eur: marketData.eur ?? 0,
    date: dateStr,
  };

  // Update cache
  historicalPriceCache.set(dateStr, price);

  // Limit cache size to last 100 dates
  if (historicalPriceCache.size > 100) {
    const firstKey = historicalPriceCache.keys().next().value;
    if (firstKey) {
      historicalPriceCache.delete(firstKey);
    }
  }

  saveCacheToStorage();

  return price;
}

/**
 * Convert MINA amount to fiat value
 * @param minaAmount Amount in nanomina (1 MINA = 1e9 nanomina)
 * @param priceUsd Price of 1 MINA in USD
 * @param priceEur Price of 1 MINA in EUR
 */
export function convertToFiat(
  minaAmount: string | bigint | number | null | undefined,
  priceUsd: number,
  priceEur: number,
): { usd: number; eur: number } {
  const nanomina = parseNanomina(minaAmount);
  if (nanomina === null) return { usd: 0, eur: 0 };

  // Fiat is inherently approximate (float price, rounded to cents), so a
  // Number here is fine; the exact-integer path lives in formatMina.
  const mina = Number(nanomina) / 1e9;
  return {
    usd: mina * priceUsd,
    eur: mina * priceEur,
  };
}

/**
 * Format fiat value for display
 */
export function formatFiatValue(
  value: number,
  currency: 'USD' | 'EUR',
): string {
  const symbol = currency === 'USD' ? '$' : '\u20AC';
  if (value < 0.01) {
    return `<${symbol}0.01`;
  }
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
