/**
 * localStorage access that never throws.
 *
 * Browsers with site data blocked (privacy settings, some enterprise
 * policies, Safari "Block All Cookies") throw a SecurityError on *any*
 * localStorage access — including at module-evaluation time, which would
 * abort the JS bundle before React mounts and leave a permanent white screen.
 * These wrappers degrade to null / no-op so the app still loads and falls
 * back to in-memory defaults for the session.
 */
export function getStoredItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStoredItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — keep state in memory for this session.
  }
}

export function removeStoredItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable — nothing to remove.
  }
}
