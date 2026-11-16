// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What the cluster page says of the server's own cluster: loaded with the page, not with every screen. */
export const cloudAdminEn = {
  cloudAdmin: {
    settings: {
      remote: 'Remote sessions',
      remoteLead:
        'A remote session runs on a member’s own device, in a directory they chose. With no turn, message or attached client for this long, it pauses: its host drains the turn, checkpoints and exits, and the next message wakes it on that device. Pausing never deletes anything.',
      remoteIdle: 'Pause idle remote sessions after, in minutes (0: never)',
      remoteIdleHint: 'From 0 to 1440; 60 by default.',
    },
    clusters: {
      inCluster: 'The server’s own cluster: credentials read from its pod',
      gcLast: 'Garbage collected {{when}}',
      orphanedVolumes_one: '{{count}} orphaned volume to delete at the provider',
      orphanedVolumes_other: '{{count}} orphaned volumes to delete at the provider',
    },
    profiles: {
      refusal: {
        storage_class_missing: 'The workspace storage class does not exist on the cluster.',
        storage_class_retains_volumes:
          'The workspace storage class keeps volumes (its reclaimPolicy is not Delete): a deleted session would leave its volume behind. Pick a class that deletes them.',
      },
    },
  },
} as const;

declare module '@/shared/i18n/types' {
  interface FeatureWording {
    readonly cloudAdmin: CloudAdminWording['cloudAdmin'];
  }
}
type CloudAdminWording = typeof cloudAdminEn;

registerWording({
  en: cloudAdminEn,
  fr: {
    cloudAdmin: {
      settings: {
        remote: 'Sessions à distance',
        remoteLead:
          'Une session à distance tourne sur l’appareil d’un membre, dans un dossier qu’il a choisi. Sans tour, message ni client attaché pendant cette durée, elle se met en pause : son hôte termine le tour, enregistre un point de reprise et s’arrête, et le message suivant la réveille sur cet appareil. La pause ne supprime jamais rien.',
        remoteIdle: 'Mettre en pause les sessions à distance inactives après, en minutes (0 : jamais)',
        remoteIdleHint: 'De 0 à 1440 ; 60 par défaut.',
      },
      clusters: {
        inCluster: 'Le cluster du serveur : identifiants lus dans son pod',
        gcLast: 'Ramasse-miettes passé {{when}}',
        orphanedVolumes_one: '{{count}} volume orphelin à supprimer chez le fournisseur',
        orphanedVolumes_other: '{{count}} volumes orphelins à supprimer chez le fournisseur',
      },
      profiles: {
        refusal: {
          storage_class_missing: 'La classe de stockage des espaces de travail n’existe pas sur le cluster.',
          storage_class_retains_volumes:
            'La classe de stockage des espaces de travail garde les volumes (son reclaimPolicy n’est pas Delete) : une session supprimée laisserait son volume. Choisissez une classe qui les supprime.',
        },
      },
    },
  },
});
