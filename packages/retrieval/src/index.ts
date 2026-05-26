import type { ScoutTask } from "@hybrid/contracts";

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

