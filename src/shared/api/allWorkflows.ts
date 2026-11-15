// SPDX-License-Identifier: Apache-2.0
import { listWorkflowsQueryKey } from '@gen/api/@tanstack/react-query.gen';
import { listWorkflows } from '@gen/api/sdk.gen';
import { readWorkflow, type Workflow } from '@/shared/api/workflowDocument';

/** The page the workflows are read by: the largest the server serves (`listWorkflows`, 1 to 100). */
export const WORKFLOWS_PAGE = 100;

/** An organization keeps at most 1000 workflows: ten full pages, and one more read that finds the end. */
export const MAX_WORKFLOW_PAGES = 11;

/** Every workflow the console can read, in the server's order. */
export interface WorkflowsRead {
  readonly items: Workflow[];
}

/** The query of every workflow: its key, and the read of every page. */
export interface AllWorkflowsQuery {
  readonly queryKey: ReturnType<typeof listWorkflowsQueryKey>;
  readonly queryFn: (context: { readonly signal: AbortSignal }) => Promise<WorkflowsRead>;
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
        for (const document of data.items) {
          const workflow = readWorkflow(document);
          if (workflow !== undefined) items.push(workflow);
        }
        if (typeof data.next !== 'string') break;
        after = data.next;
      }
      return { items };
    },
  };
}
