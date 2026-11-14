import type { en } from '@/shared/i18n/locales/en';

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Same keys as English, any wording. */
export type LocaleShape = Widen<typeof en>;

export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Every text of a wording: the dotted path of each leaf of `T`. */
type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** A plural text (`commits_one`, `commits_other`) is asked for by its base key (`commits`), with a `count`. */
type PluralBase<Key extends string> =
  Key extends `${infer Base}_${'zero' | 'one' | 'two' | 'few' | 'many' | 'other'}` ? Base : Key;

/** The keys `t` accepts: those of the English wording, which every language has (LocaleShape). A wrong one fails the typecheck. */
export type WordingKey = PluralBase<Paths<typeof en & FeatureWording>>;

/**
 * The words that ship with a feature's own chunk (`registerWording`), not in the wording every screen loads. A feature
 * declares its keys here by merging into this interface, so `t` accepts them, and only the feature's code asks for them.
 */
export interface FeatureWording {
  /** Nothing: an interface needs a member of its own before the features add theirs. */
  readonly featureWording: string;
}
