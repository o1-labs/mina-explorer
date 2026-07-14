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

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decode a base58 string to bytes, or null if it has invalid characters. */
function base58Decode(input: string): Uint8Array | null {
  let num = 0n;
  for (const ch of input) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  // Leading '1' characters encode leading zero bytes.
  for (const ch of input) {
    if (ch === '1') bytes.unshift(0);
    else break;
  }
  return Uint8Array.from(bytes);
}

// Mina memos are base58check-encoded: a 1-byte version (0x14), a 34-byte memo
// [tag, length, ...32 data bytes], then a 4-byte checksum — 39 bytes in all. A
// text memo has tag 0x01; the text is the first `length` data bytes as UTF-8.
const MEMO_ENCODED_LENGTH = 39;
const MEMO_VERSION_BYTE = 0x14;
const MEMO_TEXT_TAG = 0x01;

/**
 * Decode a Mina transaction memo to its text. Returns '' for the empty memo or
 * anything that isn't a decodable text memo — the previous base64 (`atob`)
 * implementation rendered every real base58check memo as a garbage blob.
 *
 * The 4-byte checksum is stripped but not verified: memos come from the chain
 * (already well-formed) and this runs during render, so the structural checks
 * (39 bytes, version 0x14, tag 0x01) are enough without a synchronous SHA-256.
 */
export function decodeMemo(memo: string): string {
  if (!memo) return '';

  const decoded = base58Decode(memo);
  if (
    !decoded ||
    decoded.length !== MEMO_ENCODED_LENGTH ||
    decoded[0] !== MEMO_VERSION_BYTE
  ) {
    return '';
  }

  const payload = decoded.subarray(1, decoded.length - 4); // drop version + checksum
  const tag = payload[0];
  const length = payload[1];
  if (tag !== MEMO_TEXT_TAG || length === 0) return '';

  const text = new TextDecoder().decode(payload.subarray(2, 2 + length));
  // Defensive: drop any stray control characters.
  return text.replace(/[\x00-\x1f\x7f]/g, '').trim();
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
