import { i18n, pickLanguage } from '@/shared/i18n/i18n';

describe('pickLanguage', () => {
  it('takes the first supported browser language', () => {
    expect(pickLanguage(['de-DE', 'fr-FR', 'en-US'])).toBe('fr');
  });

  it('falls back to English', () => {
    expect(pickLanguage(['de-DE'])).toBe('en');
    expect(pickLanguage([])).toBe('en');
  });
});

describe('document language', () => {
  it('follows the language shown', async () => {
    expect(document.documentElement.lang).toBe('en');
    await i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');
    await i18n.changeLanguage('en');
  });
});
