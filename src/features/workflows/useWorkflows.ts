// SPDX-License-Identifier: AGPL-3.0-only
import { getWorkflowOptions, listWorkflowsOptions } from '@gen/api/@tanstack/react-query.gen';
import type { Workflow } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

export interface WorkflowsViewModel {
  readonly workflows: readonly Workflow[] | undefined;
  readonly failure: Error | undefined;
}

export function useWorkflows(): WorkflowsViewModel {
  const query = useQuery(ready(listWorkflowsOptions()));
  return { workflows: query.data?.items, failure: failureOf(query.error) };
}

export interface WorkflowViewModel {
  readonly workflow: Workflow | undefined;
  readonly failure: Error | undefined;
}

export function useWorkflow(id: string): WorkflowViewModel {
  const query = useQuery(ready(getWorkflowOptions({ path: { id } })));
  return { workflow: query.data, failure: failureOf(query.error) };
}
