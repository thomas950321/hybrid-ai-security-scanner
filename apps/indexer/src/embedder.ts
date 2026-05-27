import OpenAI from "openai";

import { loadAppConfig } from "@hybrid/config";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) {
    return client;
  }

  const config = loadAppConfig();

  client = new OpenAI({
    baseURL: config.aiBaseUrl,
    apiKey: config.aiApiKey,
  });
  return client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const config = loadAppConfig();
  const openai = getClient();

  const response = await openai.embeddings.create({
    model: config.embeddingModel,
    input: text,
  });

  return response.data[0]?.embedding ?? [];
}

export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const config = loadAppConfig();
  const openai = getClient();

  const response = await openai.embeddings.create({
    model: config.embeddingModel,
    input: texts,
  });

  const embeddingMap = new Map<number, number[]>();
  for (const item of response.data) {
    embeddingMap.set(item.index, item.embedding);
  }

  return texts.map((_, index) => embeddingMap.get(index) ?? []);
}
