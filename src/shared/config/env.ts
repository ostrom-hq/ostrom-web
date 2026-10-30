import { z } from 'zod';

function apiOrigin(value: string): string {
  return value.startsWith('/') ? '' : value.replace(/\/+$/, '').replace(/\/api$/, '');
}

const envSchema = z.object({
  // The contract's paths already start with /api/v1: '' is the same origin (nginx proxies /api/), or an origin URL.
  // The former default `/api` and a URL ending in `/api` keep working: the prefix is the contract's, never doubled.
  VITE_OSTROM_API_URL: z
    .union([z.literal(''), z.literal('/api'), z.literal('/api/'), z.url({ protocol: /^https?$/ })])
    .default('')
    .transform(apiOrigin),
  VITE_MOCKS: z.enum(['true', 'false']).default('false'),
});

export interface AppEnv {
  readonly apiBaseUrl: string;
  /** Serve the API from MSW in the browser (development and the Playwright build without a server). */
  readonly mocks: boolean;
}

/** Build-time variables are a boundary too: a typo fails at start-up, not three screens later. */
export function parseEnv(raw: Record<string, unknown>): AppEnv {
  const env = envSchema.parse(raw);
  return { apiBaseUrl: env.VITE_OSTROM_API_URL, mocks: env.VITE_MOCKS === 'true' };
}
