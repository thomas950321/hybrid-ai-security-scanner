CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS scan_runs (
  id UUID PRIMARY KEY,
  target_url TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scout_tasks (
  id UUID PRIMARY KEY,
  scan_run_id UUID REFERENCES scan_runs(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  route TEXT NOT NULL,
  query_params JSONB NOT NULL DEFAULT '[]'::jsonb,
  template_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS code_chunks (
  id UUID PRIMARY KEY,
  repository_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  route TEXT,
  symbol_name TEXT,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS code_chunks_route_idx
  ON code_chunks(route);

CREATE INDEX IF NOT EXISTS code_chunks_embedding_cosine_idx
  ON code_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS verification_runs (
  id UUID PRIMARY KEY,
  scout_task_id UUID REFERENCES scout_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  hypothesis JSONB,
  poc_request JSONB,
  outcome JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

