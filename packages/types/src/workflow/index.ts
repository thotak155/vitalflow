import { z } from "zod";

import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";

export const TaskIdSchema = z.string().uuid().brand<"TaskId">();
export type TaskId = z.infer<typeof TaskIdSchema>;

export const WorkflowRunIdSchema = z.string().uuid().brand<"WorkflowRunId">();
export type WorkflowRunId = z.infer<typeof WorkflowRunIdSchema>;

export const TaskStatusSchema = z.enum([
  "pending",
  "assigned",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
]);

export const TaskSchema = z.object({
  id: TaskIdSchema,
  tenantId: TenantIdSchema,
  workflowRunId: WorkflowRunIdSchema.optional(),
  title: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  assigneeId: UserIdSchema.optional(),
  status: TaskStatusSchema,
  priority: z.enum(["low", "normal", "high", "urgent"]),
  dueAt: z.string().datetime().optional(),
});
export type Task = z.infer<typeof TaskSchema>;
