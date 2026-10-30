# ostrom-web

The Ostrom web console: React 19 + TypeScript (strictest settings), Vite, TanStack Router and Query,
Zustand, zod at the boundaries, Vitest + Testing Library, Playwright. AGPL-3.0, with `ee/` under the
Ostrom Enterprise License ([`LICENSING.md`](LICENSING.md)).

## Commands

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm check        # typecheck + lint + format + unit tests (what CI runs first)
pnpm build
pnpm e2e          # Playwright against `pnpm preview`
```

## Architecture

```
src/
  app/        shell, router, providers: the only place that wires features together
  features/   one folder per screen family; a feature exposes its public API in index.ts
  shared/     api client, ui kit, theme, i18n: never imports features/ or app/
ee/           enterprise screens, loaded lazily, never imported statically by src/
```

Rules enforced by the toolchain, not by review:

- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`, `noUncheckedSideEffectImports`.
- ESLint: `strict-type-checked` + `stylistic-type-checked`, no `any`, no `@ts-*` comments, no inline
  `eslint-disable` (`noInlineConfig`), exhaustive `switch`, strict boolean expressions, no `enum`,
  explicit return types on exports, jsx-a11y strict, React hooks (compiler rules), and import boundaries
  between `app/`, `features/` and `shared/`.
- Data crossing a boundary (API, `localStorage`, URL) is parsed with zod before the app trusts it.
- Patterns: custom hooks are the ViewModels of screens, Zustand holds local state, TanStack Query holds
  server state. Every string goes through i18n (`en` is the source, `fr` must have the same shape).
