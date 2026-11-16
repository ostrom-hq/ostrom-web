// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What the profiles of a cloud session say: loaded with the Cloud screens, not with every screen. */
export const cloudEn = {
  cloud: {
    start: {
      mode: 'Mode',
      modes: { terminal: 'Terminal', conversation: 'Conversation' },
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
    remote: {
      kind: { cloud: 'Cloud', remote: 'Remote · {{device}}' },
      offlineChip: 'Offline',
      waitingChip: 'Waiting for the device',
      refusedChip: 'Refused by the device',
      kindFilter: { label: 'Where the sessions run', all: 'All', cloud: 'Cloud', remote: 'Remote' },
      start: {
        target: { label: 'Where should it run?', cloud: 'Cloud', device: 'Online device' },
        device: 'Device',
        deviceThis: 'This device',
        devicesLoading: 'Reading your online devices…',
        noDevice:
          'None of your devices is online. On a computer, sign the Ostrom CLI in (ostrom login) and start its service (ostrom service install), then refresh.',
        refresh: 'Refresh',
        folder: 'Folder',
        foldersLoading: 'Reading the device’s folders…',
        noFolder:
          'This device offers no folder yet. On it, add one with ostrom folders add PATH, then refresh.',
        folderHint: 'The folders this device’s owner allowed. Only their names reach the server.',
        agent: 'Agent',
        permissions: 'Permissions',
        permissionModes: { ask: 'Ask', bypass: 'Bypass' },
        askHint:
          'Claude Code asks before acting, and you answer from any of your devices; Codex only writes in the folder. Kept for the next session.',
        bypassWarning:
          'The agent changes the folder’s files and runs commands on {{device}} without asking. Kept for the next session.',
        resume: 'Resume a session',
        resumeNone: 'None',
        resumeNoneHint: 'A new conversation',
        turns_one: '{{count}} message',
        turns_other: '{{count}} messages',
        resumeEmpty: 'No earlier Claude Code session in this folder.',
        resumeMore: 'Show older sessions',
        resumeHint:
          'Continues a Claude Code conversation of this folder on {{device}}; the original stays as it was. Only its title, date and number of messages reach the server, and only you see them.',
        resumeOldDaemon: 'Update Ostrom on {{device}} (ostrom update) to resume a session there.',
        resumeLoading: 'Reading the folder’s sessions on the device…',
        retry: 'Retry',
        name: 'Name',
        overrides: 'Overrides · optional',
        model: 'Model',
        effort: 'Effort',
        agentDefault: 'Agent default',
        message: 'First message',
        messageHint: 'What should the agent do? Optional.',
        startOn: 'Start on {{device}}',
        create: 'Create the session',
      },
      deviceRefusal: {
        device_offline:
          'This device is offline: its Ostrom service is not connected. Start it on the device (ostrom service install), or choose another device.',
        folder_not_published:
          'This device no longer offers this folder. Add it on the device with ostrom folders add, or choose another folder.',
        device_not_found: 'This device is not one of yours any more, or it was removed.',
        remote_requires_login: 'Only the device’s owner, signed in with a password, starts a session on it.',
        device_target_unsupported:
          'This server does not start sessions on your devices. Update it to use them.',
        invalid_folder: 'Choose one of the folders the device offers.',
        resume_unsupported:
          'Ostrom on this device is too old to resume a session. Update it on the device (ostrom update).',
        device_no_answer: 'The device did not answer in time. Try again.',
        resume_folder: 'The device could not read this folder’s sessions ({{code}}).',
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
      mode: 'Mode',
      modes: { terminal: 'Terminal', conversation: 'Conversation' },
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
    remote: {
      kind: { cloud: 'Cloud', remote: 'À distance · {{device}}' },
      offlineChip: 'Hors ligne',
      waitingChip: 'En attente de l’appareil',
      refusedChip: 'Refusée par l’appareil',
      kindFilter: { label: 'Où tournent les sessions', all: 'Toutes', cloud: 'Cloud', remote: 'À distance' },
      start: {
        target: { label: 'Où doit-elle tourner ?', cloud: 'Cloud', device: 'Appareil en ligne' },
        device: 'Appareil',
        deviceThis: 'Cet appareil',
        devicesLoading: 'Lecture de vos appareils en ligne…',
        noDevice:
          'Aucun de vos appareils n’est en ligne. Sur un ordinateur, connectez la CLI Ostrom (ostrom login) et démarrez son service (ostrom service install), puis actualisez.',
        refresh: 'Actualiser',
        folder: 'Dossier',
        foldersLoading: 'Lecture des dossiers de l’appareil…',
        noFolder:
          'Cet appareil ne propose encore aucun dossier. Sur celui-ci, ajoutez-en un avec ostrom folders add CHEMIN, puis actualisez.',
        folderHint:
          'Les dossiers autorisés par le propriétaire de cet appareil. Seuls leurs noms parviennent au serveur.',
        agent: 'Agent',
        permissions: 'Autorisations',
        permissionModes: { ask: 'Demander', bypass: 'Ne pas demander' },
        askHint:
          'Claude Code demande avant d’agir, et vous répondez depuis n’importe lequel de vos appareils ; Codex n’écrit que dans le dossier. Conservé pour la prochaine session.',
        bypassWarning:
          'L’agent modifie les fichiers du dossier et exécute des commandes sur {{device}} sans demander. Conservé pour la prochaine session.',
        resume: 'Reprendre une session',
        resumeNone: 'Aucune',
        resumeNoneHint: 'Une nouvelle conversation',
        turns_one: '{{count}} message',
        turns_other: '{{count}} messages',
        resumeEmpty: 'Aucune session Claude Code antérieure dans ce dossier.',
        resumeMore: 'Afficher les sessions plus anciennes',
        resumeHint:
          'Reprend une conversation Claude Code de ce dossier sur {{device}} ; l’originale reste telle quelle. Seuls son titre, sa date et son nombre de messages parviennent au serveur, et vous seul les voyez.',
        resumeOldDaemon: 'Mettez à jour Ostrom sur {{device}} (ostrom update) pour y reprendre une session.',
        resumeLoading: 'Lecture des sessions du dossier sur l’appareil…',
        retry: 'Réessayer',
        name: 'Nom',
        overrides: 'Réglages · facultatif',
        model: 'Modèle',
        effort: 'Effort',
        agentDefault: 'Agent par défaut',
        message: 'Premier message',
        messageHint: 'Que doit faire l’agent ? Facultatif.',
        startOn: 'Démarrer sur {{device}}',
        create: 'Créer la session',
      },
      deviceRefusal: {
        device_offline:
          'Cet appareil est hors ligne : son service Ostrom n’est pas connecté. Démarrez-le sur l’appareil (ostrom service install), ou choisissez un autre appareil.',
        folder_not_published:
          'Cet appareil ne propose plus ce dossier. Ajoutez-le sur l’appareil avec ostrom folders add, ou choisissez un autre dossier.',
        device_not_found: 'Cet appareil n’est plus l’un des vôtres, ou il a été supprimé.',
        remote_requires_login:
          'Seul le propriétaire de l’appareil, connecté avec un mot de passe, peut y démarrer une session.',
        device_target_unsupported:
          'Ce serveur ne démarre pas de sessions sur vos appareils. Mettez-le à jour pour les utiliser.',
        invalid_folder: 'Choisissez l’un des dossiers proposés par l’appareil.',
        resume_unsupported:
          'Ostrom sur cet appareil est trop ancien pour reprendre une session. Mettez-le à jour sur l’appareil (ostrom update).',
        device_no_answer: 'L’appareil n’a pas répondu à temps. Réessayez.',
        resume_folder: 'L’appareil n’a pas pu lire les sessions de ce dossier ({{code}}).',
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
