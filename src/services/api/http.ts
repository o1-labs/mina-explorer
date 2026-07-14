// Shared fetch wrapper for the API layer.
//
// Every network request in src/services/api goes through fetchWithTimeout so
// that no fetch can hang indefinitely on a stalled-but-connected endpoint: the
// request aborts after DEFAULT_TIMEOUT_MS and surfaces a distinct TimeoutError
// that hooks render as a retryable error instead of an infinite spinner.

/** Default per-request timeout (ms). */
export const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Thrown when a request exceeds its timeout. Distinct from a generic network
 * error so callers/UI can show a clear, retryable "timed out" message.
 */
export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * True for a timeout abort — either our own TimeoutError or the DOMException
 * (name 'TimeoutError') that AbortSignal.timeout() aborts a fetch with.
 */
export function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof TimeoutError ||
    (error instanceof DOMException && error.name === 'TimeoutError')
  );
}

/**
 * fetch() with a mandatory timeout. On timeout the underlying request is
 * aborted (via AbortSignal.timeout) and a TimeoutError is thrown. Any other
 * error — including the TypeError a network/CORS failure produces — propagates
 * unchanged, so existing error detection (e.g. isCorsError) still works.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}
