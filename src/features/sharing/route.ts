// SPDX-License-Identifier: Apache-2.0
// What app/ reads before this feature's screens load (the router loads them lazily, a chunk per feature):
// nothing here may import a screen or a component, or the screens ship in the first download again. Only what the
// address needs lives here: the rest of the gallery's code is in ./gallery, with the screens.
import { z } from 'zod/mini';

/** TeamCode's gallery tabs: everything the person reads, what they own, what was shared with them. */
export const ARTIFACT_SCOPES = ['team', 'mine', 'shared'] as const;
export type ArtifactScope = (typeof ARTIFACT_SCOPES)[number];

/** Where an artifact was created: an agent on a machine, an agent of a cloud session, or a person or a program. */
export const ARTIFACT_ORIGINS = ['local_run', 'cloud_session', 'api'] as const;
export type ArtifactOriginKind = (typeof ARTIFACT_ORIGINS)[number];

const FILTER_ACCESSES = ['personal', 'team', 'link'] as const;

/** A launch or a cloud session id, as the server takes it (`listArtifacts`). */
const filterId = z.catch(
  z.optional(z.string().check(z.trim(), z.regex(/^[A-Za-z0-9._:-]{1,64}$/))),
  undefined,
);

/**
 * The gallery's address, as TeamCode's: `?scope=` is the tab (everything without it), `?origin=` and `?access=` the
 * filters, `?session=` and `?launch=` everything one cloud session or one launch published. A value it does not know
 * is no filter.
 */
export const artifactsSearchSchema = z.object({
  scope: z.catch(z.optional(z.enum(['mine', 'shared'])), undefined),
  origin: z.catch(z.optional(z.enum(ARTIFACT_ORIGINS)), undefined),
  access: z.catch(z.optional(z.enum(FILTER_ACCESSES)), undefined),
  session: filterId,
  launch: filterId,
});
export type GalleryFilters = z.infer<typeof artifactsSearchSchema>;
