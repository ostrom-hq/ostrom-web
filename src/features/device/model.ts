// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod/mini';

/**
 * `/device?code=ABCD-EFGH`, the page `ostrom login` opens (the server's `verificationUriComplete`), or `/device` alone
 * (`verificationUri`), where the person types the code their terminal shows. Anything but one string reads as no code.
 */
export const deviceSearchSchema = z.object({
  code: z.catch(z.optional(z.string()), undefined),
});

/** The letters of a code, as the server draws them (`USER_CODE_ALPHABET`): no vowels, no look-alikes. */
const USER_CODE = /^[BCDFGHJKMNPQRSTVWXZ]{4}-[BCDFGHJKMNPQRSTVWXZ]{4}$/;

/**
 * A code as typed, the way the server reads it (`normalizeUserCode`): capitals, without spaces or dashes, then
 * `ABCD-EFGH`. Anything that is not eight letters stays as it came, and is not a code.
 */
export function normalizeCode(typed: string): string {
  const letters = typed.toUpperCase().replace(/[\s-]/g, '');
  return letters.length === 8 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters;
}

/** Whether a normalized code can be one the server gave: only then is it read, or shown back to the person. */
export function isUserCode(code: string): boolean {
  return USER_CODE.test(code);
}
