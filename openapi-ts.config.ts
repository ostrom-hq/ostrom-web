import { defineConfig } from '@hey-api/openapi-ts';

// The contract is ostrom-core's `api/openapi.yaml`. Until core publishes it, `contract/openapi.yaml` mirrors
// the slice the console needs; OSTROM_CONTRACT points the generator at another copy (core's checkout).
const input = process.env['OSTROM_CONTRACT'] ?? './contract/openapi.yaml';

// Enums are open (CS-04): a newer server may send a value this console does not know yet (the contract only grows,
// AGENTS rule 8). The type is the known values or any other string, and the Zod schema accepts any string, so one new
// status never fails a whole response; the screens show an unknown value as text. An enum of one value is a constant
// (a discriminator such as `type: 'error'`) and stays closed.
const OPEN_ENUM_MIN_VALUES = 2;

export default defineConfig({
  input,
  output: { path: 'gen/api' },
  parser: {
    hooks: {
      operations: {
        // The live event feed is a server-sent event stream, which the console will read with an `EventSource`, never
        // through a query: its `after` cursor makes the react-query plugin generate an infinite query, which does not
        // type for a stream. The operation keeps its SDK function and types, and gets no query.
        getKind: (operation) => (operation.path === '/api/v1/events' ? [] : undefined),
      },
    },
  },
  plugins: [
    '@hey-api/client-fetch',
    {
      name: '@hey-api/typescript',
      $resolvers: {
        enum: (ctx) => {
          const base = ctx.nodes.base(ctx);
          if (ctx.nodes.items(ctx).enumMembers.length < OPEN_ENUM_MIN_VALUES) return base;
          // `string & {}` keeps the known values in editor completion, where a bare `string` would absorb them.
          return ctx.$.type.or(base, ctx.$.type.and(ctx.$.type('string'), ctx.$.type.object()));
        },
      },
    },
    // RFC 3339 allows `+02:00` as well as `Z`: accept both, so one server timestamp never fails a whole list.
    {
      name: 'zod',
      compatibilityVersion: 'mini',
      dates: { offset: true },
      $resolvers: {
        enum: (ctx) => {
          const base = ctx.nodes.base(ctx);
          if (ctx.nodes.items(ctx).enumMembers.length < OPEN_ENUM_MIN_VALUES) return base;
          const { z } = ctx.plugin.imports;
          return ctx
            .$(z)
            .attr('union')
            .call(ctx.$.array(base, ctx.$(z).attr('string').call()));
        },
      },
    },
    { name: '@hey-api/sdk', validator: true },
    '@tanstack/react-query',
    'msw',
  ],
});
