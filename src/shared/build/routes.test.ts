// SPDX-License-Identifier: AGPL-3.0-only
import { patternOf, routesOf } from '@/shared/build/routes';

const ROUTER = `
const home = createRoute({
  path: '/',
  component: lazyRouteComponent(async () => import('@/features/onboarding'), 'HomeScreen'),
});
const yes = createRoute({
  path: '/yes',
  component: lazyRouteComponent(async () => import('@/features/yes'), 'YesQueueScreen'),
});
const session = createRoute({
  path: "/sessions/$sessionId",
  component: lazyRouteComponent(async () => import("@/features/sessions"), 'SessionScreen'),
});
`;

describe('routesOf', () => {
  it('reads each route with the feature its screen loads from', () => {
    expect(routesOf(ROUTER)).toEqual([
      { path: '/', feature: 'onboarding' },
      { path: '/yes', feature: 'yes' },
      { path: '/sessions/$sessionId', feature: 'sessions' },
    ]);
  });

  it('refuses a route whose screen is not lazy: it would be in the first download', () => {
    expect(() => routesOf(`createRoute({ path: '/yes', component: YesQueueScreen })`)).toThrow(
      /a route without a lazy screen/,
    );
  });

  it('refuses a definition it cannot read', () => {
    expect(() => routesOf(`x path: '' , import('@/features/rules')`)).toThrow(
      /a route without a lazy screen/,
    );
  });
});

describe('patternOf', () => {
  it('matches the whole pathname, a parameter one segment, a trailing slash or not', () => {
    const session = new RegExp(patternOf('/sessions/$sessionId'));
    expect(session.test('/sessions/abc')).toBe(true);
    expect(session.test('/sessions/abc/')).toBe(true);
    expect(session.test('/sessions/abc/more')).toBe(false);
    expect(session.test('/sessions')).toBe(false);
    expect(new RegExp(patternOf('/')).test('/')).toBe(true);
    expect(new RegExp(patternOf('/')).test('/yes')).toBe(false);
  });

  it('reads a literal segment literally', () => {
    expect(new RegExp(patternOf('/a.b')).test('/axb')).toBe(false);
  });
});
