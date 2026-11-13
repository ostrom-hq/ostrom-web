// SPDX-License-Identifier: Apache-2.0
import type { ZodMiniEnum, ZodMiniString, ZodMiniUnion } from 'zod/mini';

/** The known values of a generated open enum (`zRunStatus`), for a list of choices or a membership test. */
export function knownValues<T extends Readonly<Record<string, string>>>(
  schema: ZodMiniUnion<readonly [ZodMiniEnum<T>, ZodMiniString]>,
): readonly T[keyof T][] {
  return schema._zod.def.options[0].options;
}

/**
 * What a table says of an enum value, or `fallback` when the value is not in it (CS-04: a newer server may send a
 * value this console does not know). Reads own keys only, so `constructor` or `toString` is unknown like any other.
 */
export function knownOr<K extends string, V>(table: Readonly<Record<K, V>>, value: string, fallback: V): V {
  for (const [key, found] of Object.entries<V>(table)) {
    if (key === value) return found;
  }
  return fallback;
}

/** Whether `value` is one of `known`, narrowing it to the known values. */
export function isKnown<K extends string>(known: readonly K[], value: string): value is K {
  return known.some((candidate) => candidate === value);
}

/** The known values of an open enum (`'a' | 'b' | (string & {})`): what the console may send and switch over. */
export type Known<T> = T extends unknown ? (string extends T ? never : T) : never;
