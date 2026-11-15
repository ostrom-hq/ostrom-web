// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What the cluster page says of the server's own cluster: loaded with the page, not with every screen. */
export const cloudAdminEn = {
  cloudAdmin: {
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
