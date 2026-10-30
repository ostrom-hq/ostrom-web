import type { LocaleShape } from '@/shared/i18n/types';

export const fr = {
  app: {
    name: 'Ostrom',
    skipToContent: 'Aller au contenu',
    nav: { label: 'Principale', home: 'Accueil' },
    theme: { toLight: 'Passer au thème clair', toDark: 'Passer au thème sombre' },
  },
  home: {
    title: 'Chaque changement d’agent, validé par la bonne personne.',
    lead: 'La console Ostrom est en reconstruction. Les écrans arrivent un par un.',
  },
} as const satisfies LocaleShape;
