// SPDX-License-Identifier: Apache-2.0
// The API document the console's client (gen/api) is generated from: openapi.json of the npm package @ostrom-hq/openapi,
// which ostrom-server's CI generates and publishes (ostrom-core docs/decisions/0001), at the version package.json pins
// in `ostrom.openapi`. Written to .ostrom/openapi.json, never committed. Pure logic; scripts/fetch-openapi.ts runs it.
import { z } from 'zod';

export const OPENAPI_PACKAGE = '@ostrom-hq/openapi';
export const REGISTRY = 'https://npm.pkg.github.com';
export const DOCUMENT_PATH = '.ostrom/openapi.json';

export type FetchSource = { readonly kind: 'file'; readonly path: string } | { readonly kind: 'package' };

const USAGE = 'usage: node scripts/fetch-openapi.ts [--from <path to openapi.json>]';

/** `--from <file>` copies a local document (a server build's); without arguments, the pinned package. */
export function parseArguments(argv: readonly string[]): FetchSource {
  const [flag, value, ...rest] = argv;
  if (flag === undefined) return { kind: 'package' };
  if (flag === '--from' && value !== undefined && rest.length === 0) return { kind: 'file', path: value };
  throw new Error(USAGE);
}

const manifest = z.object({ ostrom: z.object({ openapi: z.string().regex(/^\d+\.\d+\.\d+$/) }) });

/** The version of @ostrom-hq/openapi that package.json pins (`ostrom.openapi`). */
export function pinnedVersion(packageJson: string): string {
  const parsed = manifest.safeParse(JSON.parse(packageJson));
  if (!parsed.success) throw new Error(`package.json pins no ${OPENAPI_PACKAGE} version in ostrom.openapi`);
  return parsed.data.ostrom.openapi;
}

/** The npm configuration that reads the package: GitHub Packages for the scope, with the token. */
export function npmConfig(token: string): string {
  return `@ostrom-hq:registry=${REGISTRY}\n//npm.pkg.github.com/:_authToken=${token}\n`;
}

/** The `npm pack` arguments that download the pinned tarball into `dir`. */
export function packArguments(version: string, dir: string, userconfig: string): string[] {
  return [
    'pack',
    `${OPENAPI_PACKAGE}@${version}`,
    '--pack-destination',
    dir,
    '--userconfig',
    userconfig,
    '--silent',
  ];
}

const document = z.object({
  openapi: z.string().regex(/^3\.1\.\d+$/, 'the document must be OpenAPI 3.1'),
  info: z.object({ title: z.string(), version: z.string() }),
  paths: z.record(z.string(), z.unknown()),
});

/** Checks that the text is an OpenAPI 3.1 description before the reference is built from it; returns its version. */
export function validateDocument(text: string): string {
  const parsed = document.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`not an OpenAPI 3.1 description: ${z.prettifyError(parsed.error)}`);
  return parsed.data.info.version;
}

export interface FetchIo {
  readonly readFile: (path: string) => string;
  /** The package's openapi.json at `version`, downloaded with `npm pack` and read from the tarball. */
  readonly readPackage: (version: string) => string;
  readonly writeFile: (path: string, text: string) => void;
}

/** Reads, checks and writes the document; returns a one-line report. */
export function fetchOpenApi(source: FetchSource, io: FetchIo): string {
  const read = (): { readonly origin: string; readonly text: string } => {
    if (source.kind === 'file') return { origin: source.path, text: io.readFile(source.path) };
    const version = pinnedVersion(io.readFile('package.json'));
    return { origin: `${OPENAPI_PACKAGE}@${version}`, text: io.readPackage(version) };
  };
  const { origin, text } = read();
  const version = validateDocument(text);
  io.writeFile(DOCUMENT_PATH, text);
  return `${DOCUMENT_PATH}: API ${version} from ${origin}.`;
}
