import type { LocaleShape } from '@/shared/i18n/types';

export const fr = {
  app: {
    name: 'Ostrom',
    skipToContent: 'Aller au contenu',
    nav: { label: 'Principale', home: 'Accueil' },
    theme: {
      switch: 'Thème : {{current}}. Passer en {{next}}',
      names: { system: 'système', light: 'clair', dark: 'sombre' },
    },
    notFound: { title: 'Rien ici', body: 'Cette page n’existe pas.', home: 'Retour à la console' },
    error: {
      title: 'Quelque chose a cassé',
      body: 'Cet écran n’a pas pu se charger. Le reste d’Ostrom fonctionne.',
    },
  },
  home: {
    title: 'Chaque changement d’agent, validé par la bonne personne.',
    lead: 'La console Ostrom est en reconstruction. Les écrans arrivent un par un.',
  },
} as const satisfies LocaleShape;
