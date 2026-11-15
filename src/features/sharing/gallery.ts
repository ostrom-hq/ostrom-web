// SPDX-License-Identifier: Apache-2.0
import type { Artifact, ListArtifactsData } from '@gen/api/types.gen';
import type { ArtifactScope, GalleryFilters } from './route';
/** The address of a tab and its filters: only what is set, so the plain gallery keeps its plain address. */
export function searchOf(filters: GalleryFilters): GalleryFilters {
  return {
    ...(filters.scope === undefined ? {} : { scope: filters.scope }),
    ...(filters.origin === undefined ? {} : { origin: filters.origin }),
    ...(filters.access === undefined ? {} : { access: filters.access }),
    ...(filters.session === undefined ? {} : { session: filters.session }),
    ...(filters.launch === undefined ? {} : { launch: filters.launch }),
  };
}

/** The same without the cloud session or launch pinned: every origin again. */
export function everyOrigin(filters: GalleryFilters): GalleryFilters {
  return searchOf({ ...filters, session: undefined, launch: undefined });
}

/** The filters of one tab: the scope is the tab's. */
export function scopeOf(filters: GalleryFilters): ArtifactScope {
  return filters.scope ?? 'team';
}

/** The filters on another tab: everything is the plain address, no scope. */
export function onTab(filters: GalleryFilters, tab: ArtifactScope): GalleryFilters {
  return searchOf({ ...filters, scope: tab === 'team' ? undefined : tab });
}

/** Whether anything narrows the list besides the tab. */
export function isFiltered(filters: GalleryFilters): boolean {
  return (
    filters.origin !== undefined ||
    filters.access !== undefined ||
    filters.session !== undefined ||
    filters.launch !== undefined
  );
}

/** The query of `listArtifacts` for the gallery's filters (the session is the contract's `cloudSession`). */
export function queryOf(filters: GalleryFilters): NonNullable<ListArtifactsData['query']> {
  return {
    ...(filters.scope === undefined ? {} : { scope: filters.scope }),
    ...(filters.origin === undefined ? {} : { origin: filters.origin }),
    ...(filters.access === undefined ? {} : { access: filters.access }),
    ...(filters.session === undefined ? {} : { cloudSession: filters.session }),
    ...(filters.launch === undefined ? {} : { launch: filters.launch }),
  };
}

/** Where the artifact came from: the launch of its agent token, and the cloud session it was opened for. */
export type ArtifactOriginView =
  | { readonly kind: 'api' }
  | { readonly kind: 'local_run'; readonly launch: string }
  | { readonly kind: 'cloud_session'; readonly launch: string; readonly session: string };

export function originOf(artifact: Artifact): ArtifactOriginView {
  const origin = artifact.origin;
  if (origin === undefined) return { kind: 'api' };
  return origin.cloudSessionId === undefined
    ? { kind: 'local_run', launch: origin.launchId }
    : { kind: 'cloud_session', launch: origin.launchId, session: origin.cloudSessionId };
}

/** TeamCode shows an id's first eight characters. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

const UNITS = ['B', 'KB', 'MB'] as const;

/** A file's size for the reader: bytes under a kilobyte, then one decimal; a gigabyte is the largest unit. */
export function formatBytes(bytes: number, locale: string): string {
  const show = (value: number, unit: string): string =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 'B' ? 0 : 1 }).format(value)} ${unit}`;
  let value = bytes;
  for (const unit of UNITS) {
    // Rounded to what is shown: 1023.99 KB is 1 MB, never « 1,024 KB ».
    if (Math.round(value * 10) / 10 < 1024) return show(value, unit);
    value /= 1024;
  }
  return show(value, 'GB');
}
