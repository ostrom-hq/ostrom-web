// SPDX-License-Identifier: Apache-2.0
import { bootChunkOf, type ModuleGraph, type ModuleNode } from './bootChunk';

/** A build's graph from its static importers; `main` is the entry. */
function graphOf(importers: Readonly<Record<string, readonly string[]>>, asked: string[] = []): ModuleGraph {
  return {
    getModuleInfo: (id): ModuleNode | null => {
      asked.push(id);
      const of = importers[id];
      return of === undefined ? null : { isEntry: id === '/w/src/main.tsx', importers: of };
    },
  };
}

const MAIN = '/w/src/main.tsx';

describe('bootChunkOf', () => {
  it('puts the entry and what it imports statically, however deep, in the boot chunk', () => {
    const graph = graphOf({
      [MAIN]: [],
      '/w/src/app/router.ts': [MAIN],
      '/w/node_modules/react/index.js': ['/w/src/app/router.ts'],
    });
    expect(bootChunkOf(MAIN, graph)).toBe('boot');
    expect(bootChunkOf('/w/node_modules/react/index.js', graph)).toBe('boot');
  });

  it('leaves a screen loaded on demand, and what only it imports, to their own chunk', () => {
    // The screen's only importer is dynamic: rolldown lists none.
    const graph = graphOf({
      [MAIN]: [],
      '/w/src/features/rules/index.ts': [],
      '/w/node_modules/diff/index.js': ['/w/src/features/rules/index.ts'],
    });
    expect(bootChunkOf('/w/src/features/rules/index.ts', graph)).toBeNull();
    expect(bootChunkOf('/w/node_modules/diff/index.js', graph)).toBeNull();
    expect(bootChunkOf('/w/src/features/gone.ts', graph)).toBeNull();
  });

  it('puts what the screens share beside the entry, but not a language, which comes on its own', () => {
    const graph = graphOf({});
    expect(bootChunkOf('/w/src/shared/ui/Screen.tsx', graph)).toBe('shared');
    expect(bootChunkOf('C:\\w\\src\\shared\\org\\useCurrentOrg.ts', graph)).toBe('shared');
    expect(
      bootChunkOf(
        '/w/node_modules/.pnpm/@tanstack+react-query@5/node_modules/@tanstack/react-query/build/useInfiniteQuery.js',
        graph,
      ),
    ).toBe('shared');
    expect(bootChunkOf('/w/node_modules/@tanstack/query-core/build/infiniteQueryObserver.js', graph)).toBe(
      'shared',
    );
    expect(bootChunkOf('/w/src/shared/i18n/locales/fr.ts', graph)).toBeNull();
  });

  it('keeps a shared part the entry imports in the boot chunk', () => {
    const graph = graphOf({ [MAIN]: [], '/w/src/shared/ui/Page.tsx': [MAIN] });
    expect(bootChunkOf('/w/src/shared/ui/Page.tsx', graph)).toBe('boot');
  });

  it('follows an import cycle without looping, and still finds the entry past it', () => {
    // a and b import each other; b is also imported by the entry.
    const graph = graphOf({
      [MAIN]: [],
      '/w/src/features/a.ts': ['/w/src/features/b.ts'],
      '/w/src/features/b.ts': ['/w/src/features/a.ts', MAIN],
    });
    expect(bootChunkOf('/w/src/features/a.ts', graph)).toBe('boot');
  });

  it('answers a cycle no entry reaches as not loaded with the entry', () => {
    const graph = graphOf({
      [MAIN]: [],
      '/w/src/features/a.ts': ['/w/src/features/b.ts'],
      '/w/src/features/b.ts': ['/w/src/features/a.ts'],
    });
    expect(bootChunkOf('/w/src/features/a.ts', graph)).toBeNull();
  });

  it('asks the graph once per module across a build', () => {
    const asked: string[] = [];
    const known = new Map<string, boolean>();
    const graph = graphOf(
      { [MAIN]: [], '/w/src/features/x.ts': [MAIN], '/w/src/features/y.ts': ['/w/src/features/x.ts'] },
      asked,
    );
    expect(bootChunkOf('/w/src/features/y.ts', graph, known)).toBe('boot');
    expect(bootChunkOf('/w/src/features/x.ts', graph, known)).toBe('boot');
    expect(asked).toEqual(['/w/src/features/y.ts', '/w/src/features/x.ts', MAIN]);
  });

  it('puts a small part two features use in the shared chunk, and leaves one a single feature uses to it', () => {
    const part = (name: string): string => `\0part#${name}`;
    const graph = graphOf({
      [MAIN]: [],
      '/w/src/features/rules/useRules.ts': [],
      '/w/src/features/spend/useSpend.ts': [],
      // A part reached through another part, and a cycle between two parts on the way.
      [part('listRules')]: ['/w/src/features/rules/useRules.ts', part('listRulesOptions')],
      [part('listRulesOptions')]: [part('listRules'), '/w/src/features/spend/useSpend.ts'],
      [part('getSpend')]: ['/w/src/features/spend/useSpend.ts', part('gone')],
      '/w/node_modules/chart/index.js': [
        '/w/src/features/rules/useRules.ts',
        '/w/src/features/spend/useSpend.ts',
      ],
    });
    const small = (id: string): boolean => id.startsWith('\0part#');
    expect(bootChunkOf(part('listRules'), graph, new Map(), small)).toBe('shared');
    expect(bootChunkOf(part('getSpend'), graph, new Map(), small)).toBeNull();
    // Shared, but not small: left to the automatic splitting.
    expect(bootChunkOf('/w/node_modules/chart/index.js', graph, new Map(), small)).toBeNull();
  });
});
