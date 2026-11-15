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
    session: {
      profile: 'profile {{name}} v{{version}}',
      expires: 'deleted {{when}} unless resumed',
      terminated: { deleted: 'deleted', expired: 'expired while paused' },
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
    session: {
      profile: 'profil {{name}} v{{version}}',
      expires: 'supprimée {{when}} si elle n’est pas reprise',
      terminated: { deleted: 'supprimée', expired: 'expirée en pause' },
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
