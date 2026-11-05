// SPDX-License-Identifier: AGPL-3.0-only
// No import: vite.config.ts reads this file too, without the app's `@` alias.

/** One declaration of a split module, as its own module: what it exports, and its code. */
export interface ModulePart {
  readonly names: readonly string[];
  readonly code: string;
}

/** A module split by declaration: the module that takes its place, and one part per top-level declaration. */
export interface SplitModule {
  /** Re-exports each name the module exported from the part that declares it. */
  readonly facade: string;
  readonly parts: readonly ModulePart[];
}

/** How the facade and the parts name a part: by the first name it declares. */
export type PartAddress = (name: string) => string;

interface Node {
  readonly type: string;
  readonly start: number;
  readonly end: number;
}

interface Declared {
  /** The first name it declares, which names its part. */
  readonly first: string;
  readonly names: readonly string[];
  readonly exported: boolean;
  /** The declaration's own code, `export` left out. */
  readonly code: string;
  readonly uses: ReadonlySet<string>;
}

interface Binding {
  readonly local: string;
  /** As a named import writes it (`a`, `a as b`); `undefined` for a default or namespace import. */
  readonly named: string | undefined;
}

interface Imported {
  /** The statement as written, kept whole when it binds a default or a namespace. */
  readonly code: string;
  /** The module it imports, as written. */
  readonly source: string;
  readonly bindings: readonly Binding[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isNode(value: unknown): value is Node & Readonly<Record<string, unknown>> {
  return (
    isRecord(value) &&
    typeof value['type'] === 'string' &&
    typeof value['start'] === 'number' &&
    typeof value['end'] === 'number'
  );
}

/** Every identifier written in a node: what its code may refer to (property names too, which costs an import at most). */
function identifiersIn(value: unknown, found: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) identifiersIn(item, found);
  } else if (isRecord(value)) {
    if (value['type'] === 'Identifier' && typeof value['name'] === 'string') found.add(value['name']);
    for (const [key, child] of Object.entries(value)) if (key !== 'type') identifiersIn(child, found);
  }
  return found;
}

/** An import that binds names, or `undefined` for one this split does not follow (a bare `import 'x'`). */
function importOf(statement: Node & Readonly<Record<string, unknown>>, code: string): Imported | undefined {
  const specifiers = statement['specifiers'];
  const source = statement['source'];
  if (!Array.isArray(specifiers) || specifiers.length === 0 || !isNode(source)) return undefined;
  const bindings: Binding[] = [];
  for (const specifier of specifiers) {
    if (!isNode(specifier)) return undefined;
    const local = specifier['local'];
    if (!isRecord(local) || typeof local['name'] !== 'string') return undefined;
    const named =
      specifier.type === 'ImportSpecifier' ? code.slice(specifier.start, specifier.end) : undefined;
    bindings.push({ local: local['name'], named });
  }
  return {
    code: code.slice(statement.start, statement.end),
    source: code.slice(source.start, source.end),
    bindings,
  };
}

/** A top-level `const`, `let`, function or class, each declarator a plain name; `undefined` for anything else. */
function declarationOf(node: unknown, code: string, exported: boolean): Declared | undefined {
  if (!isNode(node)) return undefined;
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
    const id = node['id'];
    if (!isRecord(id) || typeof id['name'] !== 'string') return undefined;
    const name = id['name'];
    return {
      first: name,
      names: [name],
      exported,
      code: code.slice(node.start, node.end),
      uses: identifiersIn(node, new Set()),
    };
  }
  if (node.type !== 'VariableDeclaration' || !Array.isArray(node['declarations'])) return undefined;
  const names: string[] = [];
  for (const declarator of node['declarations']) {
    const id = isRecord(declarator) ? declarator['id'] : undefined;
    if (!isRecord(id) || id['type'] !== 'Identifier' || typeof id['name'] !== 'string') return undefined;
    names.push(id['name']);
  }
  const [first] = names;
  if (first === undefined) return undefined;
  return {
    first,
    names,
    exported,
    code: code.slice(node.start, node.end),
    uses: identifiersIn(node, new Set()),
  };
}

/**
 * Splits a module made only of imports and top-level declarations (the API client the generator writes: gen/api) into
 * one module per declaration, behind a facade that re-exports what it exported. The build puts a module in one chunk
 * whole: the generated client, every call and schema of the console in three modules, came whole in the first
 * download, though each screen uses a few. Split, each call and schema goes where it is used, and a screen loaded
 * later brings its own.
 *
 * `program` is the module's ESTree (`parseAst` of Vite), `code` its source; `address` names the module of a part.
 * A part imports what it uses: the module's imports it names, and the parts of the declarations it names. Returns
 * `undefined` for a module with anything else at its top level (an expression, a default export, a re-export): it
 * stays whole.
 */
export function splitModule(code: string, program: unknown, address: PartAddress): SplitModule | undefined {
  if (!isRecord(program) || !Array.isArray(program['body'])) return undefined;
  const imports: Imported[] = [];
  const declared: Declared[] = [];
  for (const statement of program['body']) {
    if (!isNode(statement)) return undefined;
    if (statement.type === 'ImportDeclaration') {
      const imported = importOf(statement, code);
      if (imported === undefined) return undefined;
      imports.push(imported);
      continue;
    }
    const exported = statement.type === 'ExportNamedDeclaration';
    const declaration = declarationOf(exported ? statement['declaration'] : statement, code, exported);
    if (declaration === undefined) return undefined;
    declared.push(declaration);
  }
  const partOf = new Map<string, string>();
  for (const declaration of declared)
    for (const name of declaration.names) partOf.set(name, declaration.first);
  const parts = declared.map((declaration): ModulePart => {
    // Only the names it uses: an unused one would still tie the part to what it imports.
    const lines = imports.flatMap((imported) => {
      const used = imported.bindings.filter((binding) => declaration.uses.has(binding.local));
      if (used.length === 0) return [];
      const named = used.flatMap((binding) => (binding.named === undefined ? [] : [binding.named]));
      return named.length === used.length
        ? [`import { ${named.join(', ')} } from ${imported.source};`]
        : [imported.code];
    });
    const own = new Set(declaration.names);
    const siblings = new Map<string, string[]>();
    for (const used of declaration.uses) {
      const part = partOf.get(used);
      if (part === undefined || own.has(used)) continue;
      siblings.set(part, [...(siblings.get(part) ?? []), used]);
    }
    for (const [part, names] of siblings) {
      lines.push(`import { ${names.sort().join(', ')} } from ${JSON.stringify(address(part))};`);
    }
    lines.push(`export ${declaration.code}`);
    return { names: declaration.names, code: `${lines.join('\n')}\n` };
  });
  const facade = declared
    .filter((declaration) => declaration.exported)
    .map(
      (declaration) =>
        `export { ${declaration.names.join(', ')} } from ${JSON.stringify(address(declaration.first))};`,
    );
  return { facade: `${facade.join('\n')}\n`, parts };
}

/** The modules a module imports from, by the text of each import. */
export function importSources(program: unknown): string[] {
  if (!isRecord(program) || !Array.isArray(program['body'])) return [];
  const sources = new Set<string>();
  for (const statement of program['body']) {
    const source =
      isRecord(statement) && statement['type'] === 'ImportDeclaration' ? statement['source'] : undefined;
    if (isRecord(source) && typeof source['value'] === 'string') sources.add(source['value']);
  }
  return [...sources];
}

/** The parts of a split module, by each name it exports: what a part's address is. */
export type PartsByName = ReadonlyMap<string, string>;

/**
 * The imports of a module from split modules (`parts`, by the import's text), each name taken from its part instead
 * of the facade: a module that imports a schema brings that schema, not the facade and every part behind it. An
 * import with a default or namespace specifier, or a name the split module does not export, is left as written.
 * Returns the module's new code, or `undefined` when no import changed.
 */
export function importParts(
  code: string,
  program: unknown,
  parts: ReadonlyMap<string, PartsByName>,
): string | undefined {
  if (!isRecord(program) || !Array.isArray(program['body'])) return undefined;
  const edits: { start: number; end: number; text: string }[] = [];
  for (const statement of program['body']) {
    if (!isNode(statement) || statement.type !== 'ImportDeclaration') continue;
    const source = statement['source'];
    const byName =
      isRecord(source) && typeof source['value'] === 'string' ? parts.get(source['value']) : undefined;
    const specifiers = statement['specifiers'];
    if (byName === undefined || !Array.isArray(specifiers)) continue;
    const grouped = new Map<string, string[]>();
    let whole = true;
    for (const specifier of specifiers) {
      const imported =
        isRecord(specifier) && specifier['type'] === 'ImportSpecifier' ? specifier['imported'] : undefined;
      const local = isRecord(specifier) ? specifier['local'] : undefined;
      const name = isRecord(imported) && typeof imported['name'] === 'string' ? imported['name'] : undefined;
      const part = name === undefined ? undefined : byName.get(name);
      if (name === undefined || part === undefined || !isRecord(local) || typeof local['name'] !== 'string') {
        whole = false;
        break;
      }
      const binding = local['name'] === name ? name : `${name} as ${local['name']}`;
      grouped.set(part, [...(grouped.get(part) ?? []), binding]);
    }
    if (!whole || grouped.size === 0) continue;
    const text = [...grouped]
      .map(([part, bindings]) => `import { ${bindings.join(', ')} } from ${JSON.stringify(part)};`)
      .join('\n');
    edits.push({ start: statement.start, end: statement.end, text });
  }
  if (edits.length === 0) return undefined;
  let rewritten = code;
  for (const edit of edits.reverse())
    rewritten = rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end);
  return rewritten;
}
