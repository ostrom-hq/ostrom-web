/** Where product analytics go: a PostHog project. Absent (self-hosted, local dev) means analytics are off. */
export interface AnalyticsConfig {
  readonly key: string;
  readonly host: string;
}

/** PostHog Cloud EU: the data stays in the EU. */
export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

/** The public settings the console image writes to `/config.js` at start (ostrom-web `docker/40-ostrom-config.sh`). */
export interface RuntimeConfig {
  readonly OSTROM_POSTHOG_API_KEY?: string;
  readonly OSTROM_POSTHOG_HOST?: string;
}

/** The build-time fallback, for `pnpm dev` and previews. */
export interface BuildConfig {
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
}

declare global {
  interface Window {
    readonly __OSTROM_CONFIG__?: RuntimeConfig;
  }
  interface ImportMetaEnv {
    readonly VITE_POSTHOG_KEY?: string;
    readonly VITE_POSTHOG_HOST?: string;
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

/** The runtime settings win over the build ones; no key means no analytics, and no consent banner either. */
export function readAnalyticsConfig(
  runtime: RuntimeConfig | undefined,
  build: BuildConfig,
): AnalyticsConfig | null {
  const key = nonEmpty(runtime?.OSTROM_POSTHOG_API_KEY) ?? nonEmpty(build.VITE_POSTHOG_KEY);
  if (key === undefined) return null;
  const host =
    nonEmpty(runtime?.OSTROM_POSTHOG_HOST) ?? nonEmpty(build.VITE_POSTHOG_HOST) ?? DEFAULT_POSTHOG_HOST;
  return { key, host: host.replace(/\/+$/, '') };
}
