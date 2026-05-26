import { z } from "zod";

export const severitySchema = z.enum([
  "info",
  "low",
  "medium",
  "high",
  "critical",
  "unknown",
]);

export const nucleiFindingSchema = z.object({
  "template-id": z.string(),
  "template-url": z.string().optional(),
  "matcher-name": z.string().optional(),
  "matched-at": z.string().optional(),
  host: z.string().optional(),
  ip: z.string().optional(),
  type: z.string().optional(),
  "extracted-results": z.array(z.string()).optional(),
  info: z
    .object({
      name: z.string().optional(),
      severity: severitySchema.optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

export const scoutTaskSchema = z.object({
  taskId: z.string().uuid(),
  source: z.literal("nuclei"),
  title: z.string(),
  severity: severitySchema,
  endpoint: z.string().url(),
  route: z.string(),
  queryParams: z.array(z.string()),
  templateId: z.string(),
});

export type Severity = z.infer<typeof severitySchema>;
export type NucleiFinding = z.infer<typeof nucleiFindingSchema>;
export type ScoutTask = z.infer<typeof scoutTaskSchema>;

