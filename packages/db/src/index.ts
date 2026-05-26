export const vectorSchemaNotes = {
  embeddingDimensions: 1536,
  codeChunkTable: "code_chunks",
  scoutTaskTable: "scout_tasks",
  verificationRunTable: "verification_runs",
} as const;

export interface CodeChunkRecord {
  id: string;
  repositoryPath: string;
  filePath: string;
  route: string | null;
  symbolName: string | null;
  language: string;
  content: string;
}

export interface ScoutTaskRecord {
  id: string;
  templateId: string;
  endpoint: string;
  route: string;
  severity: string;
}

