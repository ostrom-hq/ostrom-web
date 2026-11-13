// SPDX-License-Identifier: Apache-2.0

/** The rules of an organization's short name, as ostrom-server's `orgs/domain/Rules.kt` writes them. */
export const MAX_SLUG = 39;
export const MAX_ORG_NAME = 100;
const MIN_SLUG = 2;
const SLUG_PATTERN = /^[a-z0-9](?:-?[a-z0-9])*$/;

/** Kept for the console's own pages and the API. */
const RESERVED = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'docs',
  'help',
  'login',
  'logout',
  'new',
  'org',
  'orgs',
  'settings',
  'signup',
  'status',
  'support',
  'www',
]);

/** The server's `slugOf`: lower case, every other run of characters a dash, `team` when nothing usable is left. */
export function slugOf(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return cleaned.length >= MIN_SLUG && !RESERVED.has(cleaned) ? cleaned : 'team';
}

/** Why a chosen short name would be refused, or nothing when the server takes it (if it is free). */
export function slugProblem(slug: string): 'shape' | 'reserved' | undefined {
  if (slug.length < MIN_SLUG || slug.length > MAX_SLUG || !SLUG_PATTERN.test(slug)) return 'shape';
  return RESERVED.has(slug) ? 'reserved' : undefined;
}

/** The server's `validOrgName`: 1 to 100 characters once trimmed, no control character. */
export function nameProblem(name: string): 'empty' | 'long' | 'control' | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  if (trimmed.length > MAX_ORG_NAME) return 'long';
  // C0 and C1 control characters, as Kotlin's `isISOControl`.
  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return 'control';
  }
  return undefined;
}
