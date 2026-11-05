// SPDX-License-Identifier: AGPL-3.0-only
import { parseSync } from 'vite';
import { importParts, importSources, splitModule } from './splitModule';

function ast(code: string): unknown {
  return parseSync('module.js', code).program;
}

const address = (name: string): string => `part:${name}`;

function split(code: string): ReturnType<typeof splitModule> {
  return splitModule(code, ast(code), address);
}

describe('splitModule', () => {
  it('puts each declaration in a part with the imports and the declarations it uses, behind a facade', () => {
    const code = [
      "import * as z from 'zod/mini';",
      "import { client, other as renamed } from './client.gen';",
      'const helper = (id) => [id];',
      'export const zMe = z.object({ id: z.string() });',
      'export const zMeResponse = zMe;',
      'export const getMe = (options) => (options?.client ?? client).get({ key: helper(1), validate: zMeResponse });',
      'export function plain() { return renamed; }',
      'export class Box {}',
    ].join('\n');
    const result = split(code);
    expect(result?.facade).toBe(
      [
        'export { zMe } from "part:zMe";',
        'export { zMeResponse } from "part:zMeResponse";',
        'export { getMe } from "part:getMe";',
        'export { plain } from "part:plain";',
        'export { Box } from "part:Box";',
        '',
      ].join('\n'),
    );
    expect(result?.parts).toEqual([
      { names: ['helper'], code: 'export const helper = (id) => [id];\n' },
      {
        names: ['zMe'],
        code: "import * as z from 'zod/mini';\nexport const zMe = z.object({ id: z.string() });\n",
      },
      { names: ['zMeResponse'], code: 'import { zMe } from "part:zMe";\nexport const zMeResponse = zMe;\n' },
      {
        names: ['getMe'],
        code: [
          "import { client } from './client.gen';",
          'import { helper } from "part:helper";',
          'import { zMeResponse } from "part:zMeResponse";',
          'export const getMe = (options) => (options?.client ?? client).get({ key: helper(1), validate: zMeResponse });',
          '',
        ].join('\n'),
      },
      {
        names: ['plain'],
        code: "import { other as renamed } from './client.gen';\nexport function plain() { return renamed; }\n",
      },
      { names: ['Box'], code: 'export class Box {}\n' },
    ]);
  });

  it('keeps a declaration of several names in one part, imported by its first name', () => {
    const result = split('export const a = 1, b = 2;\nexport const c = a + b;');
    expect(result?.facade).toBe('export { a, b } from "part:a";\nexport { c } from "part:c";\n');
    expect(result?.parts[1]).toEqual({
      names: ['c'],
      code: 'import { a, b } from "part:a";\nexport const c = a + b;\n',
    });
  });

  it('keeps a default import whole', () => {
    const result = split("import client, { other } from './client.gen';\nexport const a = client;");
    expect(result?.parts[0]?.code).toBe(
      "import client, { other } from './client.gen';\nexport const a = client;\n",
    );
  });

  it.each([
    ['an expression', "import { a } from 'a';\na();"],
    ['a bare import', "import 'side-effect';\nexport const a = 1;"],
    ['a default export', 'export default 1;'],
    ['a re-export', "export { a } from 'a';"],
    ['a destructured declaration', 'export const { a } = b;'],
  ])('leaves a module with %s whole', (_what, code) => {
    expect(split(code)).toBeUndefined();
  });

  it('leaves whole what is not a module it can read', () => {
    expect(splitModule('', null, address)).toBeUndefined();
    expect(splitModule('', { body: 'none' }, address)).toBeUndefined();
    expect(splitModule('', { body: [{ type: 'ImportDeclaration' }] }, address)).toBeUndefined();
    const node = { start: 0, end: 0 };
    const source = { type: 'Literal', ...node };
    for (const specifiers of [[null], [{ type: 'ImportSpecifier', ...node, local: null }]]) {
      const program = { body: [{ type: 'ImportDeclaration', ...node, source, specifiers }] };
      expect(splitModule('', program, address)).toBeUndefined();
    }
    const unnamed = { body: [{ type: 'FunctionDeclaration', ...node, id: null }] };
    expect(splitModule('', unnamed, address)).toBeUndefined();
    const empty = { body: [{ type: 'VariableDeclaration', ...node, declarations: [] }] };
    expect(splitModule('', empty, address)).toBeUndefined();
    const odd = { body: [{ type: 'VariableDeclaration', ...node, declarations: [null] }] };
    expect(splitModule('', odd, address)).toBeUndefined();
    const bare = { body: [{ type: 'ExportNamedDeclaration', ...node, declaration: null }] };
    expect(splitModule('', bare, address)).toBeUndefined();
  });
});

describe('importSources', () => {
  it('names each module imported from, once', () => {
    const code =
      "import { a } from './a';\nimport { b } from './a';\nimport c from 'c';\nexport const d = 1;";
    expect(importSources(ast(code))).toEqual(['./a', 'c']);
    expect(importSources(null)).toEqual([]);
    expect(importSources({ body: [{ type: 'ImportDeclaration', source: null }] })).toEqual([]);
  });
});

describe('importParts', () => {
  const parts = new Map([
    [
      '@gen/api/zod.gen',
      new Map([
        ['zMe', 'part:me'],
        ['zRule', 'part:rule'],
        ['zRules', 'part:rule'],
      ]),
    ],
  ]);

  it('takes each name from its part, renamed as imported', () => {
    const code =
      "import { zMe, zRule as rule, zRules } from '@gen/api/zod.gen';\nimport { other } from 'other';\nuse(zMe, rule);";
    expect(importParts(code, ast(code), parts)).toBe(
      [
        'import { zMe } from "part:me";',
        'import { zRule as rule, zRules } from "part:rule";',
        "import { other } from 'other';",
        'use(zMe, rule);',
      ].join('\n'),
    );
  });

  it('leaves an import it cannot take from the parts as written', () => {
    for (const code of [
      "import * as all from '@gen/api/zod.gen';",
      "import { zMe, zGone } from '@gen/api/zod.gen';",
      "import { other } from 'other';",
      "import '@gen/api/zod.gen';",
    ]) {
      expect(importParts(code, ast(code), parts)).toBeUndefined();
    }
    expect(importParts('', null, parts)).toBeUndefined();
    const node = { type: 'ImportDeclaration', start: 0, end: 0 };
    const odd = [
      { ...node, source: null, specifiers: [] },
      { ...node, source: { value: '@gen/api/zod.gen' }, specifiers: null },
      {
        ...node,
        source: { value: '@gen/api/zod.gen' },
        specifiers: [{ type: 'ImportSpecifier', imported: { name: 'zMe' } }],
      },
      {
        ...node,
        source: { value: '@gen/api/zod.gen' },
        specifiers: [{ type: 'ImportSpecifier', imported: null }],
      },
      { ...node, source: { value: '@gen/api/zod.gen' }, specifiers: [null] },
      { type: 'ExpressionStatement', start: 0, end: 0 },
    ];
    expect(importParts('', { body: odd }, parts)).toBeUndefined();
  });
});
