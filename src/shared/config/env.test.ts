import { parseEnv } from '@/shared/config/env';

describe('parseEnv', () => {
  it('defaults to the same-origin API without mocks', () => {
    expect(parseEnv({})).toEqual({ apiBaseUrl: '/api', mocks: false });
  });

  it('reads the base URL and the mock switch', () => {
    expect(parseEnv({ VITE_OSTROM_API_URL: 'https://ostrom.example/api', VITE_MOCKS: 'true' })).toEqual({
      apiBaseUrl: 'https://ostrom.example/api',
      mocks: true,
    });
  });

  it('refuses a mock switch that is not true or false', () => {
    expect(() => parseEnv({ VITE_MOCKS: 'yes' })).toThrow();
  });
});
