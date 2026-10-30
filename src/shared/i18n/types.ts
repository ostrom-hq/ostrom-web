import type { en } from '@/shared/i18n/locales/en';

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Same keys as English, any wording. */
export type LocaleShape = Widen<typeof en>;

export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];
