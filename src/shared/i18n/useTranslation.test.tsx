import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { i18n } from '@/shared/i18n/i18n';
import { en } from '@/shared/i18n/locales/en';
import { fr } from '@/shared/i18n/locales/fr';
import { useTranslation } from '@/shared/i18n/useTranslation';

describe('useTranslation', () => {
  function Title(): ReactElement {
    const { t } = useTranslation();
    return <h1>{t('app.loading')}</h1>;
  }

  it('renders again, with the new words, when the language changes', () => {
    i18n.addResourceBundle('fr', fr);
    render(<Title />);
    expect(screen.getByRole('heading').textContent).toBe(en.app.loading);
    act(() => {
      i18n.changeLanguage('fr');
    });
    expect(screen.getByRole('heading').textContent).toBe(fr.app.loading);
    act(() => {
      i18n.changeLanguage('en');
    });
    expect(screen.getByRole('heading').textContent).toBe(en.app.loading);
  });

  it('renders again when words are added', () => {
    function Added(): ReactElement {
      const { t } = useTranslation();
      return <p>{t('app.loading')}</p>;
    }
    const { unmount } = render(<Added />);
    act(() => {
      i18n.addResourceBundle('en', { app: { loading: 'Changed' } });
    });
    expect(screen.getByText('Changed')).toBeTruthy();
    act(() => {
      i18n.addResourceBundle('en', { app: { loading: en.app.loading } });
    });
    unmount();
  });
});
