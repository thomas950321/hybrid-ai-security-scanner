import { z } from "zod";

import { scoutTaskSchema } from "./finding.js";

export const workflowStatusSchema = z.enum([
  "queued",
  "scouted",
  "enriched",
  "hypothesis_ready",
  "poc_running",
  "verified",
  "rejected",
  "failed",
]);

export const workflowRunSchema = z.object({
  runId: z.string().uuid(),
  status: workflowStatusSchema,
  task: scoutTaskSchema,
  notes: z.array(z.string()).default([]),
  updatedAt: z.string(),
});

export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

