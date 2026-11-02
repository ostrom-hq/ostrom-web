// SPDX-License-Identifier: AGPL-3.0-only
import { handleListActivity } from '@gen/api/msw.gen';
import type { ActivityItem, ApiError } from '@gen/api/types.gen';
import { type HttpHandler, HttpResponse } from 'msw';

export interface ActivityState {
  /** Newest first, as the server lists them. */
  activity: ActivityItem[];
}

/** Small, so the demo shows the next page; the server's pages are larger. */
export const ACTIVITY_PAGE = 5;

/** The server's opaque cursor, `<ISO instant>~<id>`: the items strictly older than that one. */
function cursorOf(item: ActivityItem): string {
  return `${item.at}~${item.id}`;
}

function olderThan(cursor: string): ((item: ActivityItem) => boolean) | undefined {
  const at = cursor.slice(0, cursor.indexOf('~'));
  const id = cursor.slice(cursor.indexOf('~') + 1);
  if (!cursor.includes('~') || id === '' || Number.isNaN(Date.parse(at))) return undefined;
  return (item) => item.at < at || (item.at === at && item.id < id);
}

/**
 * `GET /activity?before=&repo=` as server#72 serves it: newest first, paged by key; with `repo`, only that
 * repository's sessions (gates and workflows have none); a cursor no page gave is refused with 400.
 */
export function createActivityHandlers(state: () => ActivityState): HttpHandler[] {
  return [
    handleListActivity(({ request }) => {
      const params = new URL(request.url).searchParams;
      const repo = params.get('repo');
      const before = params.get('before');
      const older = before === null ? () => true : olderThan(before);
      if (older === undefined) {
        return HttpResponse.json<ApiError>(
          { error: { type: 'invalid_request', message: 'The cursor is not one a previous page gave.' } },
          { status: 400 },
        );
      }
      const matching = state().activity.filter(
        (item) => (repo === null || item.repo === repo) && older(item),
      );
      const page = matching.slice(0, ACTIVITY_PAGE);
      const last = page.at(-1);
      return HttpResponse.json({
        items: page,
        ...(matching.length > ACTIVITY_PAGE && last !== undefined ? { next: cursorOf(last) } : {}),
      });
    }),
  ];
}
