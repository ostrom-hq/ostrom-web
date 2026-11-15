// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What the Usage review pages say: loaded with their chunk, not with every screen. */
export const usageReviewEn = {
  usageReview: {
    title: 'Usage review',
    lead: 'Model calls whose final usage never reached the ledger (a stream cut, a replica lost) keep the charge they were admitted for, on the day they were held, until an administrator corrects it from the provider’s evidence. Owners and admins only.',
    adminsOnlyTitle: 'Owners and admins only',
    adminsOnly: 'Only the organization’s owners and admins review unknown usage.',
    views: 'Usage review',
    pending: 'Pending requests',
    history: 'Reconciliation history',
    member: 'Member',
    everyMember: 'Every member',
    noPending: 'No request needs review.',
    noHistory: 'No correction yet.',
    older: 'Older records',
    heldBy: '{{login}}, held {{when}}',
    leaseExpired: 'lease expired {{when}}, usage unknown',
    providerRequest: 'Provider request {{id}}',
    notCaptured: 'not captured',
    reconciledBy: 'Reconciled {{when}} by {{login}}',
    corrected: '{{from}} → {{to}}',
    reviewTitle: 'Usage review',
    notFoundTitle: 'Nothing to review here',
    notFound:
      'No request under review and no correction has this id in this organization (or it is still within its lease, or older than 90 days).',
    help: 'An interrupted request keeps its conservative charge until request-specific provider evidence confirms the actual usage. A quota percentage is not a request usage record. The correction keeps the original member, workflow, launch and day; it never claims that a response was delivered.',
    hold: 'The request',
    request: 'Request',
    memberFact: 'Member',
    charge: 'Charge',
    heldAt: 'Held',
    leaseExpiredAt: 'Lease expired',
    providerRequestId: 'Provider request',
    workflow: 'Workflow',
    launch: 'Launch',
    reconcile: 'Reconcile usage',
    final:
      'Type the verified total the provider billed for this request. No transcript or provider credential belongs in the evidence fields. A completed correction is final: check the record before sending.',
    verified: 'Verified total ($)',
    source: 'Evidence source',
    chooseSource: 'Choose request-specific provider evidence',
    sources: { PROVIDER_RECORD: 'Provider usage record', PROVIDER_CONFIRMATION: 'Provider confirmation' },
    reference: 'Evidence reference',
    reason: 'Reason',
    errorTag: 'Not reconciled',
    reconciling: 'Reconciling…',
    reconcileButton: 'Reconcile usage',
    reconciled: 'Correction',
    evidence: 'Evidence',
    kept: 'The original attribution and this correction are kept.',
  },
} as const;

declare module '@/shared/i18n/types' {
  interface FeatureWording {
    readonly usageReview: UsageReviewWording['usageReview'];
  }
}
type UsageReviewWording = typeof usageReviewEn;

registerWording({
  en: usageReviewEn,
  fr: {
    usageReview: {
      title: 'Revue de l’usage',
      lead: 'Les appels de modèle dont l’usage final n’a jamais atteint le registre (un flux coupé, une réplique perdue) gardent la charge pour laquelle ils ont été admis, au jour où ils ont été réservés, jusqu’à ce qu’un administrateur la corrige d’après la preuve du fournisseur. Propriétaires et admins uniquement.',
      adminsOnlyTitle: 'Propriétaires et admins uniquement',
      adminsOnly: 'Seuls les propriétaires et les admins de l’organisation revoient l’usage inconnu.',
      views: 'Revue de l’usage',
      pending: 'Requêtes en attente',
      history: 'Historique des corrections',
      member: 'Membre',
      everyMember: 'Tous les membres',
      noPending: 'Aucune requête à revoir.',
      noHistory: 'Aucune correction pour l’instant.',
      older: 'Plus anciens',
      heldBy: '{{login}}, réservé le {{when}}',
      leaseExpired: 'bail expiré le {{when}}, usage inconnu',
      providerRequest: 'Requête fournisseur {{id}}',
      notCaptured: 'non capturée',
      reconciledBy: 'Corrigé le {{when}} par {{login}}',
      corrected: '{{from}} → {{to}}',
      reviewTitle: 'Revue de l’usage',
      notFoundTitle: 'Rien à revoir ici',
      notFound:
        'Aucune requête en revue ni correction n’a cet identifiant dans cette organisation (ou elle est encore dans son bail, ou a plus de 90 jours).',
      help: 'Une requête interrompue garde sa charge prudente jusqu’à ce qu’une preuve du fournisseur propre à cette requête confirme l’usage réel. Un pourcentage de quota n’est pas un relevé d’usage de requête. La correction garde le membre, le workflow, le lancement et le jour d’origine ; elle n’affirme jamais qu’une réponse a été livrée.',
      hold: 'La requête',
      request: 'Requête',
      memberFact: 'Membre',
      charge: 'Charge',
      heldAt: 'Réservée',
      leaseExpiredAt: 'Bail expiré',
      providerRequestId: 'Requête fournisseur',
      workflow: 'Workflow',
      launch: 'Lancement',
      reconcile: 'Corriger l’usage',
      final:
        'Saisissez le total vérifié que le fournisseur a facturé pour cette requête. Aucune transcription ni identifiant du fournisseur dans les champs de preuve. Une correction faite est définitive : vérifiez le relevé avant d’envoyer.',
      verified: 'Total vérifié ($)',
      source: 'Source de la preuve',
      chooseSource: 'Choisir la preuve du fournisseur propre à la requête',
      sources: {
        PROVIDER_RECORD: 'Relevé d’usage du fournisseur',
        PROVIDER_CONFIRMATION: 'Confirmation du fournisseur',
      },
      reference: 'Référence de la preuve',
      reason: 'Raison',
      errorTag: 'Non corrigé',
      reconciling: 'Correction…',
      reconcileButton: 'Corriger l’usage',
      reconciled: 'Correction',
      evidence: 'Preuve',
      kept: 'L’attribution d’origine et cette correction sont conservées.',
    },
  },
});
