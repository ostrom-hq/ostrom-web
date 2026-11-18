// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What the capacity page says: loaded with its chunk, not with every screen. */
export const capacityEn = {
  capacity: {
    title: 'Capacity',
    lead: 'Pools keep subscription accounts for the members who call them home, and shared overflow reserves lend theirs to the members allowed to borrow them.',
    help: {
      title: 'How pools work',
      body: 'Daily budgets reset at midnight UTC. Each member receives the pool’s daily budget × their weight / the total weight of the pool’s members, optionally capped individually: two developers weighted 5 and one support member weighted 1 receive 5/11, 5/11 and 1/11. The shared home pool’s budget is the organization’s daily budget. Weight changes never erase existing spend. Assign the same named pool to a member and dedicated accounts to protect their subscription capacity; other pools cannot use those accounts unless their pool is explicitly marked as shared overflow. Overflow requires member opt-in, has no primary members, and consumes both the home and source budgets. It never increases a member’s allowance.',
    },
    pools: {
      title: 'Pool budgets',
      sizing: 'Shared home pool budget and automatic pool size',
      newTitle: 'Add or update a pool',
      named: 'Pool {{pool}}',
      pool: 'Pool',
      poolHint: 'Members and accounts with this pool name share its budget and accounts.',
      daily: 'Total daily budget (USD)',
      dailyHint: '{{amount}} a day · {{effect}}',
      effect: {
        new: 'New pool: name it and give it a daily budget',
        none: 'No primary members',
        members_one: '1 member',
        members_other: '{{count}} members',
      },
      overflow: 'Shared overflow reserve (named pool with no primary members)',
      reserve: 'Shared overflow reserve',
      save: 'Save pool budget',
      saving: 'Saving…',
      badDaily: 'A daily budget is a positive amount, like 40 or 12.50.',
    },
    members: {
      title: 'Members',
      pool: 'Pool (empty = shared)',
      poolHint: 'Currently {{pool}}',
      overflow: 'Allow shared overflow accounts',
      weight: 'Weight (0 = no allocation)',
      weightHint: {
        share:
          'Share of the pool relative to its other members. Pool share: {{share}} a day ({{weight}} of {{total}} × {{pool}}).',
        none: 'Share of the pool relative to its other members. Its pool has no daily budget, so no share applies.',
        plain: 'Share of the pool relative to its other members.',
      },
      badWeight: 'A weight is a whole number from 0 to 1000.',
      weightOf: 'weight {{weight}}',
      weightOfTotal: 'weight {{weight}} / {{total}}',
      shareLine: 'Pool share {{amount}} a day',
      today: {
        title: 'Today',
        of: '{{spent}} of {{limit}} today',
        noLimit: '{{spent}} today · no daily limit',
        requests: 'Requests running: {{active}} · waiting: {{waiting}}',
      },
      dailyCap: 'Optional daily cap (USD, 0 = none)',
      dailyCapHint:
        'Upper limit on the member’s daily spend; with none of their own, every member’s applies. Currently {{cap}}.',
      badCap: 'A daily cap is an amount like 25 or 12.50, or 0 for none.',
      cap: {
        own: 'Personal cap {{amount}}',
        everyMember: 'Every member’s cap {{amount}}',
        none: 'No personal cap',
      },
      capNow: {
        own: '{{amount}} a day',
        everyMember: 'every member’s, {{amount}} a day',
        none: 'none',
      },
      concurrency: 'Concurrent requests (0 = unlimited)',
      concurrencyHint: 'Requests that may run at once; more requests wait in the queue. Currently {{limit}}.',
      concurrentLine: '{{limit}} concurrent requests',
      unlimited: 'unlimited',
      save: 'Save limits',
      saving: 'Saving…',
      shared: 'Shared pool',
      named: 'Pool {{pool}}',
      overflowOn: 'shared overflow allowed',
      overflowOff: 'no shared overflow',
      you: '(you)',
    },
    errorTag: 'Not saved',
    refusal: {
      invalid_policy:
        'Use a pool name of 1 to 36 letters, digits, underscores or hyphens (or leave it empty for the shared pool), and a weight from 0 to 1000.',
      invalid_pool_budget:
        'Name the pool with 1 to 36 letters, digits, underscores or hyphens, and give it a daily budget of at most $100,000. The shared home pool’s budget is the organization’s daily budget.',
      invalid_overflow_pool: 'Shared overflow requires a named pool.',
      overflow_primary_pool:
        'A shared overflow reserve has no primary members: a pool is either some members’ home pool or a shared reserve.',
      overflow_pool_limit: 'At most 16 named reserves can be shared.',
    },
  },
} as const;

declare module '@/shared/i18n/types' {
  interface FeatureWording {
    readonly capacity: CapacityWording['capacity'];
  }
}
type CapacityWording = typeof capacityEn;

registerWording({
  en: capacityEn,
  fr: {
    capacity: {
      title: 'Capacité',
      lead: 'Les pools réservent des comptes d’abonnement aux membres qui en font leur pool d’origine, et les réserves de débordement partagées prêtent les leurs aux membres autorisés à les emprunter.',
      help: {
        title: 'Comment fonctionnent les pools',
        body: 'Les budgets quotidiens repartent à zéro à minuit UTC. Chaque membre reçoit le budget quotidien du pool × son poids / le poids total des membres du pool, avec un plafond individuel facultatif : deux développeurs de poids 5 et un membre du support de poids 1 reçoivent 5/11, 5/11 et 1/11. Le budget du pool partagé d’origine est le budget quotidien de l’organisation. Changer les poids n’efface jamais la dépense déjà faite. Donnez le même pool nommé à un membre et à des comptes dédiés pour protéger leur capacité d’abonnement ; les autres pools ne peuvent pas utiliser ces comptes, sauf si leur pool est explicitement marqué comme débordement partagé. Le débordement exige l’accord du membre, n’a aucun membre principal et consomme à la fois le budget du pool d’origine et celui de la source. Il n’augmente jamais l’allocation d’un membre.',
      },
      pools: {
        title: 'Budgets des pools',
        sizing: 'Budget du pool partagé d’origine et taille automatique du pool',
        newTitle: 'Ajouter ou modifier un pool',
        named: 'Pool {{pool}}',
        pool: 'Pool',
        poolHint: 'Les membres et les comptes de ce pool partagent son budget et ses comptes.',
        daily: 'Budget quotidien total (USD)',
        dailyHint: '{{amount}} par jour · {{effect}}',
        effect: {
          new: 'Nouveau pool : nommez-le et donnez-lui un budget quotidien',
          none: 'Aucun membre principal',
          members_one: '1 membre',
          members_other: '{{count}} membres',
        },
        overflow: 'Réserve de débordement partagée (pool nommé sans membre principal)',
        reserve: 'Réserve de débordement partagée',
        save: 'Enregistrer le budget du pool',
        saving: 'Enregistrement…',
        badDaily: 'Un budget quotidien est un montant positif, comme 40 ou 12,50.',
      },
      members: {
        title: 'Membres',
        pool: 'Pool (vide = partagé)',
        poolHint: 'Actuellement {{pool}}',
        overflow: 'Autoriser les comptes de débordement partagés',
        weight: 'Poids (0 = aucune allocation)',
        weightHint: {
          share:
            'Part du pool par rapport à ses autres membres. Part du pool : {{share}} par jour ({{weight}} sur {{total}} × {{pool}}).',
          none: 'Part du pool par rapport à ses autres membres. Son pool n’a pas de budget quotidien : aucune part ne s’applique.',
          plain: 'Part du pool par rapport à ses autres membres.',
        },
        badWeight: 'Un poids est un nombre entier de 0 à 1000.',
        weightOf: 'poids {{weight}}',
        weightOfTotal: 'poids {{weight}} / {{total}}',
        shareLine: 'Part du pool {{amount}} par jour',
        today: {
          title: 'Aujourd’hui',
          of: '{{spent}} sur {{limit}} aujourd’hui',
          noLimit: '{{spent}} aujourd’hui · aucune limite quotidienne',
          requests: 'Requêtes en cours : {{active}} · en attente : {{waiting}}',
        },
        dailyCap: 'Plafond quotidien facultatif (USD, 0 = aucun)',
        dailyCapHint:
          'Limite haute de la dépense quotidienne du membre ; sans plafond à lui, celui de chaque membre s’applique. Actuellement {{cap}}.',
        badCap: 'Un plafond quotidien est un montant comme 25 ou 12,50, ou 0 pour aucun.',
        cap: {
          own: 'Plafond personnel {{amount}}',
          everyMember: 'Plafond de chaque membre {{amount}}',
          none: 'Aucun plafond personnel',
        },
        capNow: {
          own: '{{amount}} par jour',
          everyMember: 'celui de chaque membre, {{amount}} par jour',
          none: 'aucun',
        },
        concurrency: 'Requêtes simultanées (0 = illimité)',
        concurrencyHint:
          'Requêtes qui peuvent s’exécuter en même temps ; les suivantes attendent dans la file. Actuellement {{limit}}.',
        concurrentLine: '{{limit}} requêtes simultanées',
        unlimited: 'illimité',
        save: 'Enregistrer les limites',
        saving: 'Enregistrement…',
        shared: 'Pool partagé',
        named: 'Pool {{pool}}',
        overflowOn: 'débordement partagé autorisé',
        overflowOff: 'pas de débordement partagé',
        you: '(vous)',
      },
      errorTag: 'Non enregistré',
      refusal: {
        invalid_policy:
          'Utilisez un nom de pool de 1 à 36 lettres, chiffres, tirets bas ou tirets (ou laissez-le vide pour le pool partagé), et un poids de 0 à 1000.',
        invalid_pool_budget:
          'Nommez le pool avec 1 à 36 lettres, chiffres, tirets bas ou tirets, et donnez-lui un budget quotidien d’au plus 100 000 $. Le budget du pool partagé d’origine est le budget quotidien de l’organisation.',
        invalid_overflow_pool: 'Le débordement partagé exige un pool nommé.',
        overflow_primary_pool:
          'Une réserve de débordement partagée n’a aucun membre principal : un pool est soit le pool d’origine de certains membres, soit une réserve partagée.',
        overflow_pool_limit: 'Au plus 16 réserves nommées peuvent être partagées.',
      },
    },
  },
});
