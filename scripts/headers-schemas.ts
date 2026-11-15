// SPDX-License-Identifier: Apache-2.0
// Usage: node scripts/headers-schemas.ts. Rewrites gen/api/zod.gen.ts so that each `z*Headers` schema reads its names
// from the `Headers` object the generated client validates (src/shared/build/headersSchemas.ts). Run by gen:api.
import { readFileSync, writeFileSync } from 'node:fs';
import { readHeadersSchemas } from '../src/shared/build/headersSchemas.ts';

const path = 'gen/api/zod.gen.ts';
writeFileSync(path, readHeadersSchemas(readFileSync(path, 'utf8')));
