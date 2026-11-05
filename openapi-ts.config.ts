import { defineConfig } from '@hey-api/openapi-ts';

// The contract is ostrom-core's `api/openapi.yaml`. Until core publishes it, `contract/openapi.yaml` mirrors
// the slice the console needs; OSTROM_CONTRACT points the generator at another copy (core's checkout).
const input = process.env['OSTROM_CONTRACT'] ?? './contract/openapi.yaml';

export default defineConfig({
  input,
  output: { path: 'gen/api' },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    // RFC 3339 allows `+02:00` as well as `Z`: accept both, so one server timestamp never fails a whole list.
    { name: 'zod', compatibilityVersion: 'mini', dates: { offset: true } },
    { name: '@hey-api/sdk', validator: true },
    '@tanstack/react-query',
    'msw',
  ],
});
