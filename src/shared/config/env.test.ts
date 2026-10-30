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

  it('keeps the former /api default and a URL ending in /api working, without doubling the prefix', () => {
    expect(parseEnv({ VITE_OSTROM_API_URL: '/api' }).apiBaseUrl).toBe('');
    expect(parseEnv({ VITE_OSTROM_API_URL: '/api/' }).apiBaseUrl).toBe('');
    expect(parseEnv({ VITE_OSTROM_API_URL: 'https://host.dev/api/' }).apiBaseUrl).toBe('https://host.dev');
  });

  it('refuses a base URL that is neither empty, /api nor an http(s) URL', () => {
    expect(() => parseEnv({ VITE_OSTROM_API_URL: '/v1' })).toThrow();
    expect(() => parseEnv({ VITE_OSTROM_API_URL: 'javascript:alert(1)' })).toThrow();
  });

  it('refuses a mock switch that is not true or false', () => {
    expect(() => parseEnv({ VITE_MOCKS: 'yes' })).toThrow();
  });
});
