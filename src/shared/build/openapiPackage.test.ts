// SPDX-License-Identifier: Apache-2.0
import {
  DOCUMENT_PATH,
  fetchOpenApi,
  npmConfig,
  packArguments,
  parseArguments,
  pinnedVersion,
  validateDocument,
  type FetchIo,
} from './openapiPackage';

const document = '{"openapi":"3.1.0","info":{"title":"Ostrom API","version":"0.1.0"},"paths":{}}';
const manifest = '{"name":"@ostrom-hq/web","ostrom":{"openapi":"0.1.42"}}';

function io(): FetchIo & { readonly written: Map<string, string>; readonly packages: string[] } {
  const written = new Map<string, string>();
  const packages: string[] = [];
  return {
    written,
    packages,
    readFile: (path) => (path === 'package.json' ? manifest : document),
    readPackage: (version) => {
      packages.push(version);
      return document;
    },
    writeFile: (path, text) => {
      written.set(path, text);
    },
  };
}

describe('fetch-openapi', () => {
  it('reads the pinned package by default, or a local file', () => {
    expect(parseArguments([])).toEqual({ kind: 'package' });
    expect(parseArguments(['--from', 'build/openapi.json'])).toEqual({
      kind: 'file',
      path: 'build/openapi.json',
    });
    expect(() => parseArguments(['--from'])).toThrow(/usage/);
    expect(() => parseArguments(['--ref', 'main'])).toThrow(/usage/);
    expect(() => parseArguments(['--from', 'a', 'b'])).toThrow(/usage/);
  });

  it('takes the version package.json pins, and refuses a manifest without one', () => {
    expect(pinnedVersion(manifest)).toBe('0.1.42');
    expect(() => pinnedVersion('{"name":"x"}')).toThrow(/ostrom.openapi/);
    expect(() => pinnedVersion('{"ostrom":{"openapi":"latest"}}')).toThrow(/ostrom.openapi/);
  });

  it('reads the scope from GitHub Packages with the token, into a private folder', () => {
    expect(npmConfig('t0k')).toBe(
      '@ostrom-hq:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=t0k\n',
    );
    expect(packArguments('0.1.42', '/tmp/x', '/tmp/x/.npmrc')).toEqual([
      'pack',
      '@ostrom-hq/openapi@0.1.42',
      '--pack-destination',
      '/tmp/x',
      '--userconfig',
      '/tmp/x/.npmrc',
      '--silent',
    ]);
  });

  it('checks the document is OpenAPI 3.1', () => {
    expect(validateDocument(document)).toBe('0.1.0');
    expect(() =>
      validateDocument('{"openapi":"3.0.3","info":{"title":"x","version":"1"},"paths":{}}'),
    ).toThrow(/OpenAPI 3.1/);
  });

  it('writes the pinned package document, or the local one', () => {
    const fromPackage = io();
    expect(fetchOpenApi({ kind: 'package' }, fromPackage)).toBe(
      `${DOCUMENT_PATH}: API 0.1.0 from @ostrom-hq/openapi@0.1.42.`,
    );
    expect(fromPackage.packages).toEqual(['0.1.42']);
    expect(fromPackage.written.get(DOCUMENT_PATH)).toBe(document);
    const fromFile = io();
    expect(fetchOpenApi({ kind: 'file', path: 'build/openapi.json' }, fromFile)).toBe(
      `${DOCUMENT_PATH}: API 0.1.0 from build/openapi.json.`,
    );
    expect(fromFile.packages).toEqual([]);
  });
});

describe('fetch-openapi on a document that is not JSON', () => {
  it('refuses it', () => {
    expect(() => validateDocument('openapi: 3.1.0')).toThrow();
  });
});
