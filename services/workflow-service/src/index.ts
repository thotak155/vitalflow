import type { Task, TaskId, TenantContext } from "@vitalflow/types";

export interface TaskRepository {
  create(task: Task): Promise<Task>;
  assign(id: TaskId, assigneeId: string): Promise<Task>;
  complete(id: TaskId): Promise<Task>;
}

export function makeWorkflowService(repo: TaskRepository) {
  return {
    async createTask(_ctx: TenantContext, task: Task): Promise<Task> {
      return repo.create(task);
    },
    async complete(_ctx: TenantContext, id: TaskId): Promise<Task> {
      return repo.complete(id);
    },
  };
}
