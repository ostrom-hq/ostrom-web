import { createI18n } from '@/shared/i18n/instance';
import { en } from '@/shared/i18n/locales/en';
import { fr } from '@/shared/i18n/locales/fr';

describe('a text', () => {
  it('is the key until a wording is in', () => {
    expect(createI18n().t('app.loading')).toBe('app.loading');
  });

  it('is found by its dotted key, in the language shown', () => {
    const instance = createI18n('fr');
    instance.addResourceBundle('en', en);
    instance.addResourceBundle('fr', fr);
    expect(instance.t('app.loading')).toBe(fr.app.loading);
    expect(instance.getFixedT('en')('app.loading')).toBe(en.app.loading);
    expect(instance.getResource('fr', 'app')).toEqual(fr.app);
    expect(instance.getResource('fr', 'app.loading.deeper')).toBeUndefined();
    expect(instance.getResource('fr', 'app.nope')).toBeUndefined();
  });

  it('is found under a key that has dots of its own', () => {
    const instance = createI18n();
    instance.addResourceBundle('en', { activity: { kind: { 'gate.requested': 'Yes asked' } } });
    expect(instance.t('activity.kind.gate.requested')).toBe('Yes asked');
  });

  it('takes the values of its placeholders, and nothing where there is none', () => {
    const instance = createI18n();
    instance.addResourceBundle('en', { app: { name: 'Hi {{ who }}, {{who}} and {{ other }}!' } });
    expect(instance.t('app.name', { who: 'Maya', other: 'you' })).toBe('Hi Maya, Maya and you!');
    expect(instance.t('app.name', { who: 'Maya' })).toBe('Hi Maya, Maya and !');
    expect(instance.t('app.name')).toBe('Hi {{ who }}, {{who}} and {{ other }}!');
  });
});

describe('a plural text', () => {
  const instance = createI18n();
  instance.addResourceBundle('en', en);
  instance.addResourceBundle('fr', fr);

  it('follows the plural rules of its language', () => {
    expect(instance.t('app.showMore', { count: 1 })).toBe('Show 1 more');
    expect(instance.t('app.showMore', { count: 2, left: 5 })).toBe('Show 2 more (5 left)');
    expect(instance.getFixedT('fr')('app.showMore', { count: 3, left: 5 })).toBe(
      'En afficher 3 de plus (reste 5)',
    );
    expect(instance.getFixedT('fr')('app.showMore', { count: 1 })).toBe('En afficher 1 de plus');
  });

  it('falls back to the other form when its language has no form for the count, then to the key itself', () => {
    expect(instance.getFixedT('fr')('app.showMore', { count: 1_000_000, left: 5 })).toBe(
      'En afficher 1000000 de plus (reste 5)',
    );
    expect(instance.t('app.loading', { count: 3 })).toBe(en.app.loading);
  });
});

describe('the wording added', () => {
  it('is merged into what a language has, section by section', () => {
    const instance = createI18n();
    instance.addResourceBundle('en', { a: { x: 'x1', y: 'y1' }, b: 'b1' });
    instance.addResourceBundle('en', { a: { y: 'y2', z: 'z2' }, b: 'b2' });
    expect(instance.getResource('en', 'a')).toEqual({ x: 'x1', y: 'y2', z: 'z2' });
    expect(instance.getResource('en', 'b')).toBe('b2');
    expect(instance.hasResourceBundle('en')).toBe(true);
    expect(instance.hasResourceBundle('fr')).toBe(false);
  });

  it('is told to those listening, until they stop', () => {
    const instance = createI18n();
    const added = vi.fn();
    const changed = vi.fn();
    instance.on('added', added);
    instance.on('languageChanged', changed);
    instance.addResourceBundle('fr', {});
    instance.changeLanguage('fr');
    instance.off('added', added);
    instance.addResourceBundle('fr', {});
    expect(added).toHaveBeenCalledExactlyOnceWith('fr');
    expect(changed).toHaveBeenCalledExactlyOnceWith('fr');
    expect(instance.language).toBe('fr');
  });
});
