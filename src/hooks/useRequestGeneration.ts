import { useRef } from 'react';

export interface RequestGeneration {
  /** Claim a token for a new request. Call once at the start of each fetch. */
  next: () => number;
  /** True only for the most recently claimed token. */
  isCurrent: (token: number) => boolean;
}

/**
 * Guards against stale async responses. When a slow request for a previous
 * network (or param) resolves *after* a newer request has started, its result
 * must be discarded — otherwise it overwrites state and, for an explorer, can
 * render one network's data under another network's label (issue #66).
 *
 * Usage:
 *   const gen = useRequestGeneration();
 *   const fetchData = async () => {
 *     const token = gen.next();
 *     const data = await fetchX();
 *     if (gen.isCurrent(token)) setState(data); // ignore superseded responses
 *   };
 *
 * The returned object is stable across renders, so it is safe in hook/effect
 * dependency arrays.
 */
export function useRequestGeneration(): RequestGeneration {
  const counter = useRef(0);
  const api = useRef<RequestGeneration>({
    next: () => (counter.current += 1),
    isCurrent: (token: number) => counter.current === token,
  });
  return api.current;
}
