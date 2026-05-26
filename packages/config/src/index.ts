import { z } from "zod";

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
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  EXECUTOR_MODEL: z.string().min(1).default("openai/gpt-5"),
  OPENAI_API_KEY: z.string().min(1).optional(),
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  nucleiPath: string;
  allowedHosts: string[];
  databaseUrl?: string;
  embeddingModel: string;
  executorModel: string;
  openAiApiKey?: string;
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
    embeddingModel: parsed.EMBEDDING_MODEL,
    executorModel: parsed.EXECUTOR_MODEL,
    ...(parsed.DATABASE_URL ? { databaseUrl: parsed.DATABASE_URL } : {}),
    ...(parsed.OPENAI_API_KEY ? { openAiApiKey: parsed.OPENAI_API_KEY } : {}),
  };
}
