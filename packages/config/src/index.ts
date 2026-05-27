import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "..", "..", "..", ".env") });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  NUCLEI_PATH: z.string().min(1).default("nuclei"),
  SCANNER_ALLOWED_HOSTS: z
    .string()
    .default("localhost,127.0.0.1,::1,host.docker.internal"),
  DATABASE_URL: z.string().min(1).optional(),
  AI_BASE_URL: z
    .string()
    .default("https://integrate.api.nvidia.com/v1"),
  AI_API_KEY: z.string().default(""),
  EMBEDDING_MODEL: z.string().min(1).default("nvidia/nv-embed-qa-4"),
  EXECUTOR_MODEL: z.string().min(1).default("minimaxai/minimax-m2.7"),
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  nucleiPath: string;
  allowedHosts: string[];
  databaseUrl?: string;
  aiBaseUrl: string;
  aiApiKey: string;
  embeddingModel: string;
  executorModel: string;
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    nucleiPath: parsed.NUCLEI_PATH,
    allowedHosts: parsed.SCANNER_ALLOWED_HOSTS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    aiBaseUrl: parsed.AI_BASE_URL,
    aiApiKey: parsed.AI_API_KEY,
    embeddingModel: parsed.EMBEDDING_MODEL,
    executorModel: parsed.EXECUTOR_MODEL,
    ...(parsed.DATABASE_URL ? { databaseUrl: parsed.DATABASE_URL } : {}),
  };
}
