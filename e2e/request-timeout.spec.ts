import { test, expect } from '@playwright/test';
import {
  fetchWithTimeout,
  TimeoutError,
  isTimeoutError,
} from '../src/services/api/http';

/**
 * Unit tests for #66 — every request in the API layer goes through
 * fetchWithTimeout, which aborts a stalled-but-connected endpoint after its
 * timeout and throws a distinct TimeoutError. Hooks turn that thrown error into
 * a retryable error state instead of an infinite spinner. These call the pure
 * helper directly (global fetch is stubbed), so no browser is needed.
 */
test.describe('fetchWithTimeout (#66)', () => {
  test('rejects with TimeoutError when the endpoint stalls past the timeout', async () => {
    const realFetch = globalThis.fetch;
    // Simulate a stalled endpoint: it accepts the connection but never
    // responds, rejecting only when the request is aborted — exactly what a
    // real fetch does when AbortSignal.timeout() fires.
    globalThis.fetch = ((_input: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      })) as typeof fetch;

    try {
      const started = Date.now();
      const error = await fetchWithTimeout('https://stalled.test', {}, 50).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(TimeoutError);
      expect(isTimeoutError(error)).toBe(true);
      // It gave up at the timeout, not after some unbounded wait.
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('returns the response for an endpoint that answers in time', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response('{"ok":true}', { status: 200 })) as typeof fetch;

    try {
      const res = await fetchWithTimeout('https://fast.test', {}, 1000);
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('lets non-timeout errors (e.g. network failures) propagate unchanged', async () => {
    const realFetch = globalThis.fetch;
    const networkError = new TypeError('Failed to fetch');
    globalThis.fetch = (async () => {
      throw networkError;
    }) as typeof fetch;

    try {
      const error = await fetchWithTimeout(
        'https://broken.test',
        {},
        1000,
      ).then(
        () => null,
        (e: unknown) => e,
      );
      // Preserved as-is so daemon CORS/network detection still works.
      expect(error).toBe(networkError);
      expect(isTimeoutError(error)).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
