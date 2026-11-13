// SPDX-License-Identifier: Apache-2.0
import { patternOf, routesOf } from '@/shared/build/routes';

const ROUTER = `
const home = createRoute({
  path: '/',
  component: lazyRouteComponent(async () => import('@/features/onboarding'), 'HomeScreen'),
});
const yes = createRoute({ path: '/yes', component: YesScreen });
const session = createRoute({
  path: "/sessions/$sessionId",
  component: lazyRouteComponent(async () => import("@/features/sessions"), 'SessionScreen'),
});
`;

describe('routesOf', () => {
  it('reads each route with the feature its screen loads from, none for one in the first download', () => {
    expect(routesOf(ROUTER)).toEqual([
      { path: '/', feature: 'onboarding' },
      { path: '/yes', feature: undefined },
      { path: '/sessions/$sessionId', feature: 'sessions' },
    ]);
  });

  it('refuses a route whose screen is not lazy, unless it is in the first download on purpose', () => {
    expect(() => routesOf(`createRoute({ path: '/rules', component: RulesScreen })`)).toThrow(
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
