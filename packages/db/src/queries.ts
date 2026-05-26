import type pg from "pg";

import { vectorSchemaNotes } from "./index.js";
import { withClient } from "./client.js";

/* ------------------------------------------------------------------ */
/*  Code chunks                                                        */
/* ------------------------------------------------------------------ */

export interface InsertCodeChunkParams {
  id: string;
  repositoryPath: string;
  filePath: string;
  route: string | null;
  symbolName: string | null;
  language: string;
  content: string;
  embedding: number[];
}

export async function insertCodeChunks(
  chunks: InsertCodeChunkParams[],
): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  await withClient(async (client) => {
    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO ${vectorSchemaNotes.codeChunkTable}
         (id, repository_path, file_path, route, symbol_name, language, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
         ON CONFLICT (id) DO NOTHING`,
        [
          chunk.id,
          chunk.repositoryPath,
          chunk.filePath,
          chunk.route,
          chunk.symbolName,
          chunk.language,
          chunk.content,
          `[${chunk.embedding.join(",")}]`,
        ],
      );
    }
  });
}

export interface QueryCodeChunksParams {
  route?: string;
  queryTerms?: string[];
  embedding?: number[];
  maxChunks?: number;
}

export interface CodeChunkRow {
  id: string;
  filePath: string;
  symbolName: string | null;
  snippet: string;
  score: number;
  metadata: Record<string, string>;
}

export async function queryCodeChunks(
  params: QueryCodeChunksParams,
): Promise<CodeChunkRow[]> {
  const maxChunks = params.maxChunks ?? 8;
  const sqlParams: unknown[] = [];
  const conditions: string[] = [];
  let orderBy = "";

  if (params.route) {
    sqlParams.push(params.route);
    conditions.push(`route = $${sqlParams.length}`);
  }

  if (params.embedding && params.embedding.length > 0) {
    sqlParams.push(`[${params.embedding.join(",")}]`);
    conditions.push("embedding IS NOT NULL");
    orderBy = `ORDER BY embedding <=> $${sqlParams.length}::vector ASC`;
  }

  if (conditions.length === 0) {
    return [];
  }

  sqlParams.push(maxChunks);

  const sql = [
    `SELECT id, file_path, symbol_name, content, metadata`,
    `FROM ${vectorSchemaNotes.codeChunkTable}`,
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    orderBy,
    `LIMIT $${sqlParams.length}`,
  ]
    .filter(Boolean)
    .join("\n");

  return withClient(async (client) => {
    const result = await client.query<{
      id: string;
      file_path: string;
      symbol_name: string | null;
      content: string;
      metadata: Record<string, string>;
    }>(sql, sqlParams);

    return result.rows.map((row) => ({
      id: row.id,
      filePath: row.file_path,
      symbolName: row.symbol_name,
      snippet: row.content,
      score: 0, // set by caller if using vector search
      metadata: row.metadata ?? {},
    }));
  });
}

/* ------------------------------------------------------------------ */
/*  Scan runs                                                          */
/* ------------------------------------------------------------------ */

export async function createScanRun(params: {
  id: string;
  targetUrl: string;
  phase: string;
  status: string;
}): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO scan_runs (id, target_url, phase, status)
       VALUES ($1, $2, $3, $4)`,
      [params.id, params.targetUrl, params.phase, params.status],
    );
  });
}

export async function updateScanRunStatus(
  id: string,
  status: string,
): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `UPDATE scan_runs SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id],
    );
  });
}

/* ------------------------------------------------------------------ */
/*  Scout tasks                                                        */
/* ------------------------------------------------------------------ */

export interface ScoutTaskRow {
  id: string;
  scanRunId: string;
  source: string;
  title: string;
  severity: string;
  endpoint: string;
  route: string;
  templateId: string;
}

export async function insertScoutTask(
  task: ScoutTaskRow,
): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO scout_tasks (id, scan_run_id, source, title, severity, endpoint, route, template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        task.id,
        task.scanRunId,
        task.source,
        task.title,
        task.severity,
        task.endpoint,
        task.route,
        task.templateId,
      ],
    );
  });
}

/* ------------------------------------------------------------------ */
/*  Verification runs                                                  */
/* ------------------------------------------------------------------ */

export async function createVerificationRun(params: {
  id: string;
  scoutTaskId: string;
  status: string;
}): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO verification_runs (id, scout_task_id, status)
       VALUES ($1, $2, $3)`,
      [params.id, params.scoutTaskId, params.status],
    );
  });
}
