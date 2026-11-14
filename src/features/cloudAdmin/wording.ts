// SPDX-License-Identifier: Apache-2.0
import { registerWording } from '@/shared/i18n/i18n';

/** What the cluster page says of the server's own cluster: loaded with the page, not with every screen. */
export const cloudAdminEn = {
  cloudAdmin: {
    clusters: {
      inCluster: 'The server’s own cluster: credentials read from its pod',
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
      },
    },
  },
});
