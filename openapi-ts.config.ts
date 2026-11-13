import { defineConfig } from '@hey-api/openapi-ts';

// The server's OpenAPI document, from the npm package @ostrom-hq/openapi at the version package.json pins
// (`ostrom.openapi`), written by `pnpm openapi:fetch` (ostrom-core docs/decisions/0001). Never committed.
const input = './.ostrom/openapi.json';

// Enums are open (CS-04): a newer server may send a value this console does not know yet (the contract only grows,
// AGENTS rule 8). The type is the known values or any other string, and the Zod schema accepts any string, so one new
// status never fails a whole response; the screens show an unknown value as text. An enum of one value is a constant
// (a discriminator such as `type: 'error'`) and stays closed.
const OPEN_ENUM_MIN_VALUES = 2;

export default defineConfig({
  input,
  // The organization's event feed is a server-sent event stream the console does not read; hey-api's query
  // options cannot type a stream.
  parser: { filters: { operations: { exclude: ['GET /api/v1/events'] }, orphans: true } },
  output: { path: 'gen/api' },
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
