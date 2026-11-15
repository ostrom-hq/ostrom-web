// SPDX-License-Identifier: Apache-2.0
import { listWorkflowsQueryKey } from '@gen/api/@tanstack/react-query.gen';
import { listWorkflows } from '@gen/api/sdk.gen';
import type { Workflow, WorkflowPage } from '@gen/api/types.gen';

/** The page the workflows are read by: the largest the server serves (`listWorkflows`, 1 to 100). */
export const WORKFLOWS_PAGE = 100;

/** An organization keeps at most 1000 workflows: ten full pages, and one more read that finds the end. */
export const MAX_WORKFLOW_PAGES = 11;

/** The query of every workflow: its key, and the read of every page. */
export interface AllWorkflowsQuery {
  readonly queryKey: ReturnType<typeof listWorkflowsQueryKey>;
  readonly queryFn: (context: { readonly signal: AbortSignal }) => Promise<WorkflowPage>;
}

/**
 * Every workflow of the organization, read page by page (`limit`, then `after` the previous `next`) until a page has
 * no `next`, as TeamCode's companion loads its workflow catalogue. Under the key of the plain list, so a change that
 * invalidates the list reads them all again.
 */
export function allWorkflowsOptions(): AllWorkflowsQuery {
  return {
    queryKey: listWorkflowsQueryKey(),
    queryFn: async ({ signal }) => {
      const items: Workflow[] = [];
      let after: string | undefined;
      for (let read = 0; read < MAX_WORKFLOW_PAGES; read += 1) {
        const query = after === undefined ? { limit: WORKFLOWS_PAGE } : { limit: WORKFLOWS_PAGE, after };
        const { data } = await listWorkflows({ query, signal, throwOnError: true });
        items.push(...data.items);
        if (data.next === undefined) break;
        after = data.next;
      }
      return { items };
    },
  };
}
