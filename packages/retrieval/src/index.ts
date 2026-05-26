import OpenAI from "openai";

import { loadAppConfig } from "@hybrid/config";
import type { ScoutTask } from "@hybrid/contracts";
import { queryCodeChunks } from "@hybrid/db";

export interface RetrievalPlan {
  route: string;
  queryTerms: string[];
  metadataFilters: Record<string, string | string[]>;
  maxChunks: number;
}

export interface RetrievedChunk {
  chunkId: string;
  filePath: string;
  symbolName?: string;
  snippet: string;
  score: number;
  metadata: Record<string, string>;
}

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }
  const config = loadAppConfig();
  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for retrieval.");
  }
  openaiClient = new OpenAI({ apiKey: config.openAiApiKey });
  return openaiClient;
}

async function generateQueryEmbedding(queryTerms: string[]): Promise<number[]> {
  const config = loadAppConfig();
  const openai = getOpenAI();
  const input = queryTerms.join(" ");
  const response = await openai.embeddings.create({
    model: config.embeddingModel,
    input,
  });
  return response.data[0]?.embedding ?? [];
}

export function buildRetrievalPlan(task: ScoutTask): RetrievalPlan {
  return {
    route: task.route,
    queryTerms: [task.route, ...task.queryParams, task.templateId],
    metadataFilters: {
      route: task.route,
      queryParams: task.queryParams,
    },
    maxChunks: 8,
  };
}

export async function retrieveChunks(
  plan: RetrievalPlan,
): Promise<RetrievedChunk[]> {
  const embedding = await generateQueryEmbedding(plan.queryTerms);

  const rows = await queryCodeChunks({
    route: plan.route,
    embedding,
    maxChunks: plan.maxChunks,
  });

  return rows.map((row, index) => ({
    chunkId: row.id,
    filePath: row.filePath,
    ...(row.symbolName ? { symbolName: row.symbolName } : {}),
    snippet: row.snippet,
    score: plan.maxChunks - index,
    metadata: row.metadata,
  }));
}

export function formatRetrievedContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No retrieved source context was provided.";
  }

  return chunks
    .map((chunk, index) => {
      return [
        `Chunk ${index + 1}`,
        `File: ${chunk.filePath}`,
        chunk.symbolName ? `Symbol: ${chunk.symbolName}` : undefined,
        `Score: ${chunk.score.toFixed(4)}`,
        chunk.snippet,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

