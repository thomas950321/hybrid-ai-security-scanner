import type { WorkflowRun, WorkflowStatus } from "@hybrid/contracts";

export type WorkflowEvent =
  | { type: "SCOUT_COMPLETED"; note?: string }
  | { type: "CONTEXT_RETRIEVED"; note?: string }
  | { type: "HYPOTHESIS_READY"; note?: string }
  | { type: "POC_STARTED"; note?: string }
  | { type: "VERIFIED"; note?: string }
  | { type: "REJECTED"; note?: string }
  | { type: "FAILED"; note: string };

const allowedTransitions: Record<WorkflowStatus, WorkflowEvent["type"][]> = {
  queued: ["SCOUT_COMPLETED", "FAILED"],
  scouted: ["CONTEXT_RETRIEVED", "FAILED"],
  enriched: ["HYPOTHESIS_READY", "FAILED"],
  hypothesis_ready: ["POC_STARTED", "FAILED"],
  poc_running: ["VERIFIED", "REJECTED", "FAILED"],
  verified: [],
  rejected: [],
  failed: [],
};

const nextStatusByEvent: Record<WorkflowEvent["type"], WorkflowStatus> = {
  SCOUT_COMPLETED: "scouted",
  CONTEXT_RETRIEVED: "enriched",
  HYPOTHESIS_READY: "hypothesis_ready",
  POC_STARTED: "poc_running",
  VERIFIED: "verified",
  REJECTED: "rejected",
  FAILED: "failed",
};

export function applyWorkflowEvent(
  run: WorkflowRun,
  event: WorkflowEvent,
): WorkflowRun {
  const allowed = allowedTransitions[run.status];

  if (!allowed.includes(event.type)) {
    throw new Error(
      `Invalid workflow transition from ${run.status} via ${event.type}`,
    );
  }

  return {
    ...run,
    status: nextStatusByEvent[event.type],
    notes: event.note ? [...run.notes, event.note] : run.notes,
    updatedAt: new Date().toISOString(),
  };
}

