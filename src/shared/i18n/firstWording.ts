// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod/mini';
import { BOOTED, wordingKey } from '@/shared/build/bootScript';

/** Wording as i18next keeps it: sections of keys, of sections or texts. */
const zWording = z.record(z.string(), z.unknown());
export type Wording = z.infer<typeof zWording>;

/**
 * The wording of `language` that `/boot.js` fetched for the first screen (only the sections it shows), taken out of
 * its store so that it serves once: `undefined` when it fetched none. It resolves to `undefined` too when the answer
 * is not a wording (a failure, a page instead of JSON): the console then loads the whole language as without it.
 */
export function takeFirstWording(
  language: string,
  store: unknown = Reflect.get(globalThis, BOOTED),
): Promise<Wording | undefined> | undefined {
  if (typeof store !== 'object' || store === null) return undefined;
  const key = wordingKey(language);
  const fetched: unknown = Reflect.get(store, key);
  if (!(fetched instanceof Promise)) return undefined;
  Reflect.deleteProperty(store, key);
  return fetched.then(
    async (response: unknown) => {
      if (!(response instanceof Response) || !response.ok) return undefined;
      const parsed = zWording.safeParse(await response.json());
      return parsed.success ? parsed.data : undefined;
    },
    () => undefined,
  );
}
