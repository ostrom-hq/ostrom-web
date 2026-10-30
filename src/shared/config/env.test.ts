import { parseEnv } from '@/shared/config/env';

describe('parseEnv', () => {
  it('defaults to the same-origin API without mocks', () => {
    expect(parseEnv({})).toEqual({ apiBaseUrl: '', mocks: false });
  });

  it('reads the base URL and the mock switch', () => {
    expect(parseEnv({ VITE_OSTROM_API_URL: 'https://api.ostrom.run', VITE_MOCKS: 'true' })).toEqual({
      apiBaseUrl: 'https://api.ostrom.run',
      mocks: true,
    });
  });

  it('refuses a base URL that is neither empty nor a URL', () => {
    expect(() => parseEnv({ VITE_OSTROM_API_URL: '/api' })).toThrow();
  });

  it('refuses a mock switch that is not true or false', () => {
    expect(() => parseEnv({ VITE_MOCKS: 'yes' })).toThrow();
  });
});
