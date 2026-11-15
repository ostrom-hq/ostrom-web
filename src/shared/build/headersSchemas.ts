// SPDX-License-Identifier: Apache-2.0
// The generated client validates a request after merging its headers into a `Headers` object, which a plain
// `z.object({...})` of header names never reads: a required header (transferCloudSession's `Idempotency-Key`) always
// failed, an optional one passed without being checked. Each generated `z*Headers` schema is rewritten to read its
// declared names from the `Headers` first (`headers.get(name)`, case-insensitive as HTTP is), then parse them. Pure
// logic; scripts/headers-schemas.ts runs it on gen/api/zod.gen.ts after openapi-ts.

/** The helper the rewritten schemas call, written once after the generated imports. */
export const FROM_HEADERS = `
/** The headers a schema declares, read from a request's \`Headers\` (scripts/headers-schemas.ts); other values as they are. */
const fromHeaders = (names: readonly string[]) => (headers: unknown): unknown =>
    headers instanceof Headers
        ? Object.fromEntries(names.flatMap((name) => {
            const value = headers.get(name);
            return value === null ? [] : [[name, value]];
        }))
        : headers;
`;

const IMPORT = "import * as z from 'zod/mini';\n";
const SCHEMA = /^export const (z\w+Headers) = z\.object\(\{\n([\s\S]*?)\n\}\);$/gm;
const NAME = /^ {4}(?:'([^']+)'|([A-Za-z_$][\w$]*)): /gm;

/** The names a generated headers object declares, in order: `'Idempotency-Key'` and bare identifiers alike. */
export function declaredNames(body: string): string[] {
  // The pattern matches one of its two groups: a quoted name or a bare one.
  return [...body.matchAll(NAME)].map((match) => String(match[1] ?? match[2]));
}

/**
 * [source] (gen/api/zod.gen.ts) with every `z*Headers` object piped from [FROM_HEADERS]; the same text when it has none,
 * and an error when it is not zod/mini's output (the helper would have nowhere to go) or was already rewritten.
 */
export function readHeadersSchemas(source: string): string {
  if (!source.includes(IMPORT)) throw new Error('not the zod/mini output of openapi-ts');
  if (source.includes('const fromHeaders = ')) throw new Error('the headers schemas are already rewritten');
  let count = 0;
  const rewritten = source.replace(SCHEMA, (_, name: string, body: string) => {
    count += 1;
    const names = declaredNames(body)
      .map((header) => `'${header}'`)
      .join(', ');
    return `export const ${name} = z.pipe(z.transform(fromHeaders([${names}])), z.object({\n${body}\n}));`;
  });
  return count === 0 ? source : rewritten.replace(IMPORT, `${IMPORT}${FROM_HEADERS}`);
}
