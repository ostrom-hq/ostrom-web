// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What the pool size page says: loaded with their chunks, not with every screen. */
export const poolSizeEn = {
  poolSize: {
    title: 'Pool size',
    lead: 'Size the organization’s daily budget from the remaining capacity of its shared subscriptions, and set how the capacity controller paces the agents. Owners and admins only.',
    adminsOnlyTitle: 'Owners and admins only',
    adminsOnly: 'Only the organization’s owners and admins read the pool size.',
    settings: {
      title: 'Settings',
      autoPoolSize: 'Automatic pool size',
      autoPoolSizeHelp:
        'Computes the organization’s daily budget from what its subscription accounts have left, every ten minutes, moving at most 20% an hour. Unchecked, the typed daily budget applies, unchanged.',
      observationOnly: 'Observation only',
      observationOnlyHelp:
        'Keep forecasting, but neither space admissions nor send advice to agents. Budgets, concurrency limits and accounts’ ceilings stay enforced; advice already sent cannot be recalled.',
      save: 'Save settings',
      saving: 'Saving…',
      errorTag: 'Not saved',
    },
    status: {
      title: 'Today’s daily budget',
      effective: 'In force: {{amount}} a day ({{source}})',
      tag: 'Typed budget applies',
      none: 'No daily budget applies',
      source: { automatic: 'automatic', manual: 'typed' },
      manual: 'Typed budget',
      automatic: 'Automatic value',
      automaticAt: '{{amount}}, computed {{when}}',
      noneYet: 'none yet',
      noneTyped: 'none',
      estimate: 'Current estimate',
      estimateLeft: '{{amount}} left today, in API-equivalent',
      capacity: 'Full daily capacity',
      capacityUnknown: 'unknown: no account has learned its windows yet',
      capacityAtLeast: '{{amount}} a day, at least: {{count}} account(s) not learned yet',
      outside: 'Used outside Ostrom this week',
      outsideUnknown: 'unknown until a weekly window is learned',
      reason: {
        no_accounts: 'No shared subscription account: the typed budget applies.',
        no_estimate:
          'No account has an estimate yet: each needs three samples of a five-point rise on its windows, with priced traffic between them. The typed budget applies.',
      },
      stale:
        'The automatic value is missing or older than an hour: the typed budget applies until the next computation.',
      unpriced: 'Models without a price, left out of the samples: {{models}}',
    },
    accounts: {
      title: 'Accounts',
      empty: 'No shared account.',
      daily: '{{amount}} a day',
      boundBy: 'bound by {{window}}',
      status: {
        counted: 'Counted',
        unavailable: 'Cannot serve',
        no_fresh_observation: 'No fresh reading',
        no_estimate: 'No estimate yet',
      },
    },
    models: {
      title: 'Last seven days by model',
      row: '{{tokens}} tokens, {{cost}}',
      unpriced: 'unpriced',
    },
  },
  poolLimit: {
    title: 'Organization daily limit',
    automatic: '{{amount}} a day, sized automatically from the shared accounts',
    manual: '{{amount}} a day, as typed',
    link: 'Pool size',
  },
} as const;

declare module '@/shared/i18n/types' {
  interface FeatureWording {
    readonly poolSize: PoolSizeWording['poolSize'];
    readonly poolLimit: PoolSizeWording['poolLimit'];
  }
}
type PoolSizeWording = typeof poolSizeEn;

registerWording({
  en: poolSizeEn,
  fr: {
    poolSize: {
      title: 'Taille du pool',
      lead: 'Dimensionne le budget quotidien de l’organisation d’après la capacité restante de ses abonnements partagés, et règle la façon dont le contrôleur de capacité cadence les agents. Propriétaires et admins uniquement.',
      adminsOnlyTitle: 'Propriétaires et admins uniquement',
      adminsOnly: 'Seuls les propriétaires et les admins de l’organisation lisent la taille du pool.',
      settings: {
        title: 'Réglages',
        autoPoolSize: 'Taille automatique du pool',
        autoPoolSizeHelp:
          'Calcule le budget quotidien de l’organisation d’après ce qu’il reste à ses abonnements, toutes les dix minutes, en bougeant d’au plus 20 % par heure. Décoché, le budget quotidien saisi s’applique, inchangé.',
        observationOnly: 'Observation seule',
        observationOnlyHelp:
          'Continue les prévisions, mais n’espace pas les admissions et n’envoie aucun conseil aux agents. Les budgets, les limites de concurrence et les plafonds des comptes restent appliqués ; un conseil déjà envoyé ne se rappelle pas.',
        save: 'Enregistrer les réglages',
        saving: 'Enregistrement…',
        errorTag: 'Non enregistré',
      },
      status: {
        title: 'Budget quotidien du jour',
        effective: 'En vigueur : {{amount}} par jour ({{source}})',
        tag: 'Budget saisi appliqué',
        none: 'Aucun budget quotidien ne s’applique',
        source: { automatic: 'automatique', manual: 'saisi' },
        manual: 'Budget saisi',
        automatic: 'Valeur automatique',
        automaticAt: '{{amount}}, calculée {{when}}',
        noneYet: 'aucune pour l’instant',
        noneTyped: 'aucun',
        estimate: 'Estimation actuelle',
        estimateLeft: '{{amount}} restants aujourd’hui, en équivalent API',
        capacity: 'Capacité quotidienne complète',
        capacityUnknown: 'inconnue : aucun compte n’a encore appris ses fenêtres',
        capacityAtLeast: '{{amount}} par jour, au moins : {{count}} compte(s) pas encore appris',
        outside: 'Utilisé hors d’Ostrom cette semaine',
        outsideUnknown: 'inconnu tant qu’une fenêtre hebdomadaire n’est pas apprise',
        reason: {
          no_accounts: 'Aucun abonnement partagé : le budget saisi s’applique.',
          no_estimate:
            'Aucun compte n’a encore d’estimation : il faut trois échantillons d’une hausse de cinq points sur ses fenêtres, avec du trafic tarifé entre eux. Le budget saisi s’applique.',
        },
        stale:
          'La valeur automatique manque ou a plus d’une heure : le budget saisi s’applique jusqu’au prochain calcul.',
        unpriced: 'Modèles sans prix, écartés des échantillons : {{models}}',
      },
      accounts: {
        title: 'Comptes',
        empty: 'Aucun compte partagé.',
        daily: '{{amount}} par jour',
        boundBy: 'limité par {{window}}',
        status: {
          counted: 'Compté',
          unavailable: 'Ne peut pas servir',
          no_fresh_observation: 'Pas de relevé récent',
          no_estimate: 'Pas encore d’estimation',
        },
      },
      models: {
        title: 'Sept derniers jours par modèle',
        row: '{{tokens}} jetons, {{cost}}',
        unpriced: 'sans prix',
      },
    },
    poolLimit: {
      title: 'Limite quotidienne de l’organisation',
      automatic: '{{amount}} par jour, dimensionnés automatiquement d’après les comptes partagés',
      manual: '{{amount}} par jour, comme saisi',
      link: 'Taille du pool',
    },
  },
});
