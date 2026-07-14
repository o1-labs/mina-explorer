const MINA_DECIMALS = 9;
const NANOMINA_PER_MINA = 10n ** BigInt(MINA_DECIMALS);

/** Shown when an amount is missing or not a valid integer nanomina value. */
const AMOUNT_PLACEHOLDER = '—';

/**
 * Parse a nanomina value (integer string, integer number, or bigint) into a
 * BigInt. Returns null for null/undefined/non-integer/non-numeric input so
 * callers can render a placeholder instead of throwing.
 */
export function parseNanomina(
  value: string | number | bigint | null | undefined,
): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value;
  try {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? BigInt(value) : null;
    }
    const trimmed = value.trim();
    return /^-?\d+$/.test(trimmed) ? BigInt(trimmed) : null;
  } catch {
    return null;
  }
}

/**
 * Format a nanomina amount as a grouped MINA string with 2–9 decimals. Uses
 * BigInt end-to-end so large balances keep full precision — a plain Number
 * loses precision above 2^53 nanomina (~9.007M MINA). Returns a placeholder
 * for null/undefined/non-integer/non-numeric input instead of throwing.
 *
 * Grouping is pinned to en-US (canonical for a blockchain explorer): this keeps
 * the thousands separator from colliding with the '.' decimal and makes the
 * output deterministic regardless of the runtime locale.
 */
export function formatMina(
  nanomina: string | number | null | undefined,
): string {
  const amount = parseNanomina(nanomina);
  if (amount === null) return AMOUNT_PLACEHOLDER;

  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / NANOMINA_PER_MINA;
  const frac = abs % NANOMINA_PER_MINA;

  // Fractional part: 9 digits, drop trailing zeros but always keep >= 2.
  let fracStr = frac.toString().padStart(MINA_DECIMALS, '0').replace(/0+$/, '');
  if (fracStr.length < 2) fracStr = fracStr.padEnd(2, '0');

  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}.${fracStr}`;
}

export function formatHash(hash: string, prefixLength: number = 8): string {
  if (hash.length <= prefixLength * 2) {
    return hash;
  }
  return `${hash.slice(0, prefixLength)}...${hash.slice(-prefixLength)}`;
}

export function formatAddress(
  address: string,
  prefixLength: number = 8,
): string {
  return formatHash(address, prefixLength);
}

export function formatDateTime(dateTime: string): string {
  const date = new Date(dateTime);
  return date.toLocaleString();
}

export function formatTimeAgo(dateTime: string): string {
  const date = new Date(dateTime);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return `${diffSecs}s ago`;
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 30) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function decodeMemo(memo: string): string {
  if (
    !memo ||
    memo === 'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH'
  ) {
    return '';
  }

  try {
    // Mina memos are base58 encoded
    // The default empty memo has a specific hash
    const decoded = atob(memo);
    // Remove null bytes and control characters
    return decoded.replace(/[\x00-\x1F\x7F]/g, '').trim();
  } catch {
    return memo;
  }
}

export function isValidPublicKey(key: string): boolean {
  return key.startsWith('B62') && key.length === 55;
}

export function isValidBlockHash(hash: string): boolean {
  return hash.startsWith('3N') && hash.length >= 50;
}

export function isValidTransactionHash(hash: string): boolean {
  return hash.startsWith('Ckp') || hash.startsWith('5J');
}

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isBlockHeight(value: string): boolean {
  return /^\d+$/.test(value);
}
