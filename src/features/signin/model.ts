// SPDX-License-Identifier: AGPL-3.0-only

/** A console path to go to after signing in: only a path of this site, never another origin. */
export function safeRedirect(path: string | undefined): string {
  if (path === undefined || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\'))
    return '/';
  return path;
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
