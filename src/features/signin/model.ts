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

/** What the server's OAuth callbacks put in `/login?error=` when they refuse a sign-in. */
export const SIGN_IN_ERRORS = [
  'unavailable',
  'rate_limited',
  'access_denied',
  'expired',
  'refused',
  'link_required',
  'identity_taken',
  'signup_closed',
] as const;
export type SignInError = (typeof SIGN_IN_ERRORS)[number];

/** The refusal the address carries, in the console's words: one it knows, `other` for any other text, none without. */
export function signInErrorOf(error: string | undefined): SignInError | 'other' | undefined {
  if (error === undefined || error === '') return undefined;
  return SIGN_IN_ERRORS.find((known) => known === error) ?? 'other';
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
