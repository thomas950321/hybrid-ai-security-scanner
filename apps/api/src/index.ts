import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { z } from "zod";

import { loadAppConfig } from "@hybrid/config";
import { applyWorkflowEvent } from "@hybrid/agent-core";
import { scoutTaskSchema, workflowRunSchema } from "@hybrid/contracts";
import {
  createScanRun,
  updateScanRunStatus,
  insertScoutTask,
  createVerificationRun,
  closePool,
} from "@hybrid/db";
import { runScoutScan } from "@hybrid/nuclei";
import { buildRetrievalPlan, retrieveChunks, type RetrievedChunk } from "@hybrid/retrieval";
import { verifyFinding } from "@hybrid/executor-worker";

const config = loadAppConfig();
const app = Fastify({ logger: true });

/* ------------------------------------------------------------------ */
/*  Health                                                             */
/* ------------------------------------------------------------------ */

app.get("/health", async () => {
  return {
    ok: true,
    service: "api",
    phaseStrategy: ["scout", "analyst", "executor"],
  };
});

/* ------------------------------------------------------------------ */
/*  Scan — run full pipeline                                           */
/* ------------------------------------------------------------------ */

const scanRequestBodySchema = z.object({
  target: z.string().url(),
});

app.post<{ Body: z.infer<typeof scanRequestBodySchema> }>(
  "/scan",
  {
    schema: { body: scanRequestBodySchema },
  },
  async (req, reply) => {
    const { target } = req.body;
    const runId = randomUUID();

    app.log.info({ runId, target }, "Starting scan pipeline");

    await createScanRun({
      id: runId,
      targetUrl: target,
      phase: "scout",
      status: "queued",
    });

    reply.send({ runId, status: "queued", message: "Scan pipeline started" });

    // Run pipeline in background
    runPipeline(runId, target).catch((error) => {
      app.log.error({ runId, error }, "Pipeline failed");
    });
  },
);

/* ------------------------------------------------------------------ */
/*  Scan status                                                        */
/* ------------------------------------------------------------------ */

app.get<{ Params: { id: string } }>("/scans/:id", async (req, reply) => {
  const { getPool } = await import("@hybrid/db");
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM scan_runs WHERE id = $1`,
    [req.params.id],
  );

  if (result.rows.length === 0) {
    return reply.status(404).send({ error: "Scan not found" });
  }

  return result.rows[0];
});

/* ------------------------------------------------------------------ */
/*  Pipeline runner                                                    */
/* ------------------------------------------------------------------ */

async function runPipeline(runId: string, target: string): Promise<void> {
  let run = workflowRunSchema.parse({
    runId,
    status: "queued",
    task: {
      taskId: randomUUID(),
      source: "nuclei",
      title: `Scan ${target}`,
      severity: "unknown",
      endpoint: target,
      route: new URL(target).pathname,
      queryParams: [],
      templateId: "pipeline",
    },
    notes: [],
    updatedAt: new Date().toISOString(),
  });

  // Phase 1: Scout
  try {
    await updateScanRunStatus(runId, "scouting");
    app.log.info({ runId }, "Phase 1: Scout starting");

    const scanResult = await runScoutScan({
      target,
      nucleiPath: config.nucleiPath,
      allowedHosts: config.allowedHosts,
    });

    run = applyWorkflowEvent(run, { type: "SCOUT_COMPLETED" });
    await updateScanRunStatus(runId, "scouted");
    app.log.info({ runId, findings: scanResult.findings.length }, "Phase 1: Scout complete");

    for (const task of scanResult.tasks) {
      await insertScoutTask({
        id: task.taskId,
        scanRunId: runId,
        source: task.source,
        title: task.title,
        severity: task.severity,
        endpoint: task.endpoint,
        route: task.route,
        templateId: task.templateId,
      });
    }

    if (scanResult.tasks.length === 0) {
      app.log.info({ runId }, "No findings to analyze");
      await updateScanRunStatus(runId, "completed");
      return;
    }

    // Phase 2: Analyst — retrieve code context for each task
    await updateScanRunStatus(runId, "analyzing");
    run = applyWorkflowEvent(run, { type: "CONTEXT_RETRIEVED" });
    app.log.info({ runId }, "Phase 2: Analyst starting");

    const taskContexts: Array<{ task: z.infer<typeof scoutTaskSchema>; context: RetrievedChunk[] }> = [];

    for (const task of scanResult.tasks) {
      const plan = buildRetrievalPlan(task);
      const chunks = await retrieveChunks(plan);
      taskContexts.push({ task, context: chunks });
    }

    run = applyWorkflowEvent(run, { type: "HYPOTHESIS_READY" });
    await updateScanRunStatus(runId, "hypothesis_ready");
    app.log.info({ runId, tasks: taskContexts.length }, "Phase 2: Analyst complete");

    // Phase 3: Executor — verify each finding
    await updateScanRunStatus(runId, "verifying");
    run = applyWorkflowEvent(run, { type: "POC_STARTED" });
    app.log.info({ runId }, "Phase 3: Executor starting");

    for (const { task, context } of taskContexts) {
      const verRunId = randomUUID();
      await createVerificationRun({
        id: verRunId,
        scoutTaskId: task.taskId,
        status: "running",
      });

      try {
        const result = await verifyFinding({ task, context });
        app.log.info({ taskId: task.taskId, result }, "Verification result");
      } catch (error) {
        app.log.error({ taskId: task.taskId, error }, "Verification failed");
      }
    }

    run = applyWorkflowEvent(run, { type: "VERIFIED" });
    await updateScanRunStatus(runId, "verified");
    app.log.info({ runId }, "Phase 3: Executor complete");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run = applyWorkflowEvent(run, { type: "FAILED", note: message });
    await updateScanRunStatus(runId, "failed");
    app.log.error({ runId, error }, "Pipeline failed");
  }
}

/* ------------------------------------------------------------------ */
/*  Start server                                                       */
/* ------------------------------------------------------------------ */

app.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closePool();
  process.exit(0);
});

