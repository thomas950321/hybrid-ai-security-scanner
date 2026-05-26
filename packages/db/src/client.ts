import pg from "pg";

import { loadAppConfig } from "@hybrid/config";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) {
    return pool;
  }

  const config = loadAppConfig();

  pool = new pg.Pool({
    connectionString: config.databaseUrl ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres",
    max: 10,
  });

  pool.on("error", (error) => {
    console.error("Unexpected database pool error:", error);
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

export async function withClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
