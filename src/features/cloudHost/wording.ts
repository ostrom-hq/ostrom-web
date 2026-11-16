// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/**
 * What a remote session's device says (TeamCode's companion `SessionComponents`), on the session list and on a
 * session's screen: loaded with those screens alone.
 */
export const cloudHostEn = {
  cloudHost: {
    host: { unnamed: 'unnamed device', removed: 'removed device', fallback: 'the device' },
    offline:
      '{{device}} stopped answering, so the session paused. It goes on once the device is back online; a message asks it to resume.',
    waiting:
      'Waiting for {{device}} to start the session. Its Ostrom service picks it up within seconds while the device is online; otherwise it starts once the device is back.',
    refused: '{{device}} refused to start this session: {{why}}',
    refusal: {
      folder_not_configured: 'the folder is no longer in its list (ostrom folders list on the device).',
      folder_missing: 'the folder no longer exists on the device.',
      folder_moved:
        'the folder now leads elsewhere (it became, or goes through, a symbolic link). Add it again with ostrom folders add.',
      folder_refused: 'the folder is the home directory, contains it, or is a system directory.',
      folder_mismatch: 'the folder’s name changed on the device. Choose it again.',
      agent_unsupported:
        'its Ostrom version cannot run this agent. Update Ostrom on the device (ostrom update).',
      host_failed:
        'the agent kept stopping before it was ready. Check the agent on the device, then start a new session.',
      resume_not_found:
        'the conversation to continue is no longer in this folder on the device. Start a new session.',
      unknown: 'it gave the reason {{reason}}.',
      none: 'it gave no reason.',
    },
  },
} as const;

const cloudHostFr = {
  cloudHost: {
    host: { unnamed: 'appareil sans nom', removed: 'appareil supprimé', fallback: 'l’appareil' },
    offline:
      '{{device}} ne répond plus, la session est donc en pause. Elle reprend quand l’appareil est de nouveau en ligne ; un message lui demande de reprendre.',
    waiting:
      'En attente que {{device}} démarre la session. Son service Ostrom la prend en charge en quelques secondes tant que l’appareil est en ligne ; sinon, elle démarre dès qu’il est de retour.',
    refused: '{{device}} a refusé de démarrer cette session : {{why}}',
    refusal: {
      folder_not_configured: 'le dossier n’est plus dans sa liste (ostrom folders list sur l’appareil).',
      folder_missing: 'le dossier n’existe plus sur l’appareil.',
      folder_moved:
        'le dossier mène maintenant ailleurs (il est devenu, ou passe par, un lien symbolique). Ajoutez-le à nouveau avec ostrom folders add.',
      folder_refused: 'le dossier est le répertoire personnel, le contient, ou est un répertoire système.',
      folder_mismatch: 'le nom du dossier a changé sur l’appareil. Choisissez-le à nouveau.',
      agent_unsupported:
        'sa version d’Ostrom ne peut pas lancer cet agent. Mettez Ostrom à jour sur l’appareil (ostrom update).',
      host_failed:
        'l’agent s’arrêtait sans cesse avant d’être prêt. Vérifiez l’agent sur l’appareil, puis démarrez une nouvelle session.',
      resume_not_found:
        'la conversation à reprendre n’est plus dans ce dossier sur l’appareil. Démarrez une nouvelle session.',
      unknown: 'il a donné la raison {{reason}}.',
      none: 'il n’a donné aucune raison.',
    },
  },
};

declare module '@/shared/i18n/types' {
  interface FeatureWording {
    readonly cloudHost: CloudHostWording['cloudHost'];
  }
}
type CloudHostWording = typeof cloudHostEn;

registerWording({ en: cloudHostEn, fr: cloudHostFr });
