import { defineConfig } from '@hey-api/openapi-ts';

// The contract is ostrom-core's `api/openapi.yaml`. Until core publishes it, `contract/openapi.yaml` mirrors
// the slice the console needs; OSTROM_CONTRACT points the generator at another copy (core's checkout).
const input = process.env['OSTROM_CONTRACT'] ?? 'contract/openapi.yaml';

export default defineConfig({
  input,
  output: { path: 'gen/api' },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    'zod',
    { name: '@hey-api/sdk', validator: true },
    '@tanstack/react-query',
    'msw',
  ],
});
