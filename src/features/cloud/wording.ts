// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What the profiles of a cloud session say: loaded with the Cloud screens, not with every screen. */
export const cloudEn = {
  cloud: {
    start: {
      profile: 'Profile',
      pickProfile: 'Pick a profile',
      profilesLoading: 'Reading the profiles you may use…',
      noProfile: 'No cloud profile is assigned to you. Ask an owner or an admin of the organization for one.',
      image: 'Image',
      imageNone: 'The profile’s own image runs: it allows no other.',
      imageAllowed: 'Empty runs the profile’s image. Allowed instead: {{list}}.',
      imageNotAllowed: 'This profile does not allow that image.',
      refusal: {
        cloud_profile_not_found: 'That profile no longer exists. Pick another.',
        profile_unassigned: 'That profile is not assigned to you.',
        image_not_allowed: 'That profile does not allow this image.',
        profile_required: 'Pick the profile to run on: you may use none or several.',
        cluster_unavailable:
          'The profile’s cluster is not available: it is gone, or its credentials must be entered again.',
        namespace_not_allowed: 'The profile’s cluster no longer allows its namespace.',
      },
    },
    transfer: {
      title: 'Transfers',
      action: 'Transfer…',
      to: 'Give the session to',
      pick: 'Pick a member',
      admin: '{{login}} (administrator)',
      noRecipient: 'No other member can take this session.',
      resume: 'Resume the session for them once it is theirs',
      hintOffer:
        'They accept within 7 days; the session pauses when they do, and its workspace is theirs to trust.',
      hintNow: 'The session pauses now and becomes theirs; its workspace is reset before their agent runs.',
      offer: 'Offer the session',
      give: 'Give the session',
      sending: 'Sending…',
      keep: 'Keep it',
      fromTo: '{{from}} to {{to}}',
      resumes: 'resumes for the recipient',
      asked: 'asked {{when}}',
      expires: 'offer lapses {{when}}',
      accept: 'Accept',
      decline: 'Decline',
      cancel: 'Cancel',
      confirmCancel: 'Cancel the transfer of {{what}}',
      keepIt: 'Keep the transfer',
      state: {
        offered: 'Offered',
        accepted: 'Moving',
        completed: 'Done',
        declined: 'Declined',
        cancelled: 'Cancelled',
        expired: 'Expired',
        failed: 'Failed',
      },
      refusal: {
        transfer_disabled:
          'This instance does not allow members to transfer their sessions. Ask an administrator.',
        transfer_forbidden: 'You cannot do this to this transfer.',
        transfer_pending: 'This session already has an open transfer.',
        session_preparing: 'The session is still being prepared: transfer it once it is ready.',
        session_not_running: 'The session is over.',
        session_transferring: 'The session is being transferred to another member.',
        transfer_expired: 'The offer expired: the owner offers the session again.',
        transfer_not_open: 'The transfer is no longer open.',
        transfer_in_progress: 'The owner is being changed: the transfer can no longer be cancelled.',
        recipient_ineligible: 'That member cannot own this session.',
      },
    },
    session: {
      profile: 'profile {{name}} v{{version}}',
      expires: 'deleted {{when}} unless resumed',
      terminated: { deleted: 'ended: deleted', expired: 'ended: expired while paused' },
      deletionUnknown: 'the server gave no reason.',
      deletionBlocked: 'Its workspace volume is not deleted: {{why}}',
      deletionProblem: {
        volume_retained:
          'its storage class keeps volumes, so an administrator deletes the provider volume by hand.',
        volume_deletion_stalled: 'the provider has not deleted the volume yet; the server keeps trying.',
      },
    },
  },
} as const;

const cloudFr = {
  cloud: {
    start: {
      profile: 'Profil',
      pickProfile: 'Choisir un profil',
      profilesLoading: 'Lecture des profils que vous pouvez utiliser…',
      noProfile:
        'Aucun profil cloud ne vous est attribué. Demandez-en un à un propriétaire ou un admin de l’organisation.',
      image: 'Image',
      imageNone: 'L’image du profil est lancée : il n’en autorise pas d’autre.',
      imageAllowed: 'Vide lance l’image du profil. Autorisées à la place : {{list}}.',
      imageNotAllowed: 'Ce profil n’autorise pas cette image.',
      refusal: {
        cloud_profile_not_found: 'Ce profil n’existe plus. Choisissez-en un autre.',
        profile_unassigned: 'Ce profil ne vous est pas attribué.',
        image_not_allowed: 'Ce profil n’autorise pas cette image.',
        profile_required: 'Choisissez le profil à utiliser : vous pouvez en utiliser aucun ou plusieurs.',
        cluster_unavailable:
          'Le cluster du profil n’est pas disponible : il a disparu, ou ses identifiants doivent être saisis à nouveau.',
        namespace_not_allowed: 'Le cluster du profil n’autorise plus son namespace.',
      },
    },
    transfer: {
      title: 'Transferts',
      action: 'Transférer…',
      to: 'Donner la session à',
      pick: 'Choisir un membre',
      admin: '{{login}} (administrateur)',
      noRecipient: 'Aucun autre membre ne peut reprendre cette session.',
      resume: 'La reprendre pour lui dès qu’elle est à lui',
      hintOffer:
        'Il accepte sous 7 jours ; la session se met en pause à ce moment, et son espace de travail est à lui de juger.',
      hintNow:
        'La session se met en pause maintenant et devient la sienne ; son espace de travail est réinitialisé avant que son agent ne tourne.',
      offer: 'Proposer la session',
      give: 'Donner la session',
      sending: 'Envoi…',
      keep: 'Garder',
      fromTo: '{{from}} vers {{to}}',
      resumes: 'reprise pour le destinataire',
      asked: 'demandé {{when}}',
      expires: 'l’offre expire {{when}}',
      accept: 'Accepter',
      decline: 'Refuser',
      cancel: 'Annuler',
      confirmCancel: 'Annuler le transfert de {{what}}',
      keepIt: 'Garder le transfert',
      state: {
        offered: 'Proposé',
        accepted: 'En cours',
        completed: 'Terminé',
        declined: 'Refusé',
        cancelled: 'Annulé',
        expired: 'Expiré',
        failed: 'Échoué',
      },
      refusal: {
        transfer_disabled:
          'Cette instance n’autorise pas les membres à transférer leurs sessions. Demandez à un administrateur.',
        transfer_forbidden: 'Vous ne pouvez pas faire cela sur ce transfert.',
        transfer_pending: 'Cette session a déjà un transfert ouvert.',
        session_preparing: 'La session est encore en préparation : transférez-la une fois prête.',
        session_not_running: 'La session est terminée.',
        session_transferring: 'La session est en cours de transfert vers un autre membre.',
        transfer_expired: 'L’offre a expiré : le propriétaire propose la session à nouveau.',
        transfer_not_open: 'Le transfert n’est plus ouvert.',
        transfer_in_progress:
          'Le propriétaire est en train de changer : le transfert ne peut plus être annulé.',
        recipient_ineligible: 'Ce membre ne peut pas posséder cette session.',
      },
    },
    session: {
      profile: 'profil {{name}} v{{version}}',
      expires: 'supprimée {{when}} si elle n’est pas reprise',
      terminated: { deleted: 'fin : supprimée', expired: 'fin : expirée en pause' },
      deletionUnknown: 'le serveur n’a pas donné de raison.',
      deletionBlocked: 'Son volume de travail n’est pas supprimé : {{why}}',
      deletionProblem: {
        volume_retained:
          'sa classe de stockage garde les volumes, un administrateur supprime donc le volume chez le fournisseur à la main.',
        volume_deletion_stalled: 'le fournisseur n’a pas encore supprimé le volume ; le serveur réessaie.',
      },
    },
  },
};

declare module '@/shared/i18n/types' {
  interface FeatureWording {
    readonly cloud: CloudWording['cloud'];
  }
}
type CloudWording = typeof cloudEn;

registerWording({ en: cloudEn, fr: cloudFr });
