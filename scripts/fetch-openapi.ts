// SPDX-License-Identifier: Apache-2.0
// Usage: node scripts/fetch-openapi.ts [--from <path>]. Writes .ostrom/openapi.json, the source of gen/api (gen:api),
// from the @ostrom-hq/openapi version package.json pins (GitHub Packages: NODE_AUTH_TOKEN, else `gh auth token`, with
// the read:packages scope), or from a local file.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  fetchOpenApi,
  npmConfig,
  packArguments,
  parseArguments,
} from '../src/shared/build/openapiPackage.ts';

function readPackage(version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ostrom-openapi-'));
  try {
    const token =
      process.env['NODE_AUTH_TOKEN'] ?? execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
    const userconfig = join(dir, '.npmrc');
    writeFileSync(userconfig, npmConfig(token), { mode: 0o600 });
    execFileSync('npm', packArguments(version, dir, userconfig), { stdio: ['ignore', 'ignore', 'inherit'] });
    const tarball = readdirSync(dir).find((name) => name.endsWith('.tgz'));
    if (tarball === undefined) throw new Error(`npm pack wrote no tarball for ${version}`);
    execFileSync('tar', ['-xzf', join(dir, tarball), '-C', dir, 'package/openapi.json']);
    return readFileSync(join(dir, 'package', 'openapi.json'), 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const report = fetchOpenApi(parseArguments(process.argv.slice(2)), {
  readFile: (path) => readFileSync(path, 'utf8'),
  readPackage,
  writeFile: (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  },
});
process.stdout.write(`${report}\n`);
