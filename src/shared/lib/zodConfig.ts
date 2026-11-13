// SPDX-License-Identifier: Apache-2.0
import { config } from 'zod/mini';

/*
 * Imported first by main.tsx, before any schema exists. Zod compiles object parsers with `new Function` when
 * it can, and probes for it once: under the console's CSP (no 'unsafe-eval', audit S2-09) that probe is a
 * reported violation. jitless skips both: parsing is interpreted and the policy stays strict.
 *
 * `config`, not `z.config`: the build takes every `z.…` call for pure, to drop the schemas nothing uses (vite.config.ts,
 * `manualPureFunctions`), and would drop this one with them. scripts/bundle-budget.ts fails a build without it.
 */
config({ jitless: true });
