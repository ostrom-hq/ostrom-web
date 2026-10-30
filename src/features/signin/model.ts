// SPDX-License-Identifier: AGPL-3.0-only

const BASE = 'https://console.invalid';

/**
 * A console path to go to after signing in: only a path of this site, never another origin. Browsers drop tabs and
 * line breaks and read a backslash as a slash (`/\t/evil.example` is `//evil.example`), so any control character or
 * backslash is refused, and the path must still resolve on this site once parsed.
 */
export function safeRedirect(path: string | undefined): string {
  if (path === undefined || !path.startsWith('/') || path.includes('\\')) return '/';
  for (let index = 0; index < path.length; index += 1) {
    const code = path.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return '/';
  }
  const url = new URL(path, BASE);
  if (url.origin !== BASE) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A value an e-mailed or approver link carries in its fragment (`#token=…`), which no server ever receives. */
export function fragmentValue(hash: string, name: string): string | undefined {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get(name);
  return value === null || value === '' ? undefined : value;
}

/** Enough to send a link to: something, an at sign, a dot in the domain. The server decides the rest. */
export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}
