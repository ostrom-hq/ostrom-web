import { z } from 'zod';

const envSchema = z.object({
  VITE_OSTROM_API_URL: z.string().min(1).default('/api'),
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
