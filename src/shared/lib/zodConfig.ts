// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

/*
 * Imported first by main.tsx, before any schema exists. Zod compiles object parsers with `new Function` when
 * it can, and probes for it once: under the console's CSP (no 'unsafe-eval', audit S2-09) that probe is a
 * reported violation. jitless skips both: parsing is interpreted and the policy stays strict.
 */
z.config({ jitless: true });
