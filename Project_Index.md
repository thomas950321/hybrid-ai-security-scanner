# Project Index — Hybrid AI Security Scanner

> 建立日期: 2026-05-27
> 技術總監: AI Pair Programmer

---

## 1. 專案概觀

**名稱:** Hybrid AI Security Scanner
**類型:** pnpm monorepo (Turborepo)
**語言:** TypeScript (ES2023, NodeNext module, strict mode)
**套件管理:** pnpm 10.16.1 (workspace)
**Runtime:** Node.js ESM (`"type": "module"` 全專案)

### 三階段安全掃描管線

```
Scout (黑箱)  ──>  Analyst (程式碼感知 RAG)  ──>  Executor (AI 驗證)
```

---

## 2. 目錄結構

```
├── docker-compose.yml          # pgvector/pg17 資料庫容器
├── package.json                # root workspace
├── turbo.json                  # Turborepo pipeline
├── tsconfig.base.json          # 共用 TypeScript config
├── pnpm-workspace.yaml         # workspace 定義
├── .env.example                # 環境變數範本
│
├── apps/
│   ├── api/                    # Fastify 控制面版 + pipeline orchestrator
│   ├── scout-worker/           # Nuclei runner (CLI)
│   ├── analyst-worker/         # Retrieval planner (CLI)
│   ├── executor-worker/        # AI verification (匯出函式庫 + CLI)
│   └── indexer/                # Code repository indexer (CLI)
│
├── packages/
│   ├── contracts/              # Zod schemas + 共用型別 (zero deps)
│   ├── config/                 # Typed environment loading
│   ├── nuclei/                 # Safe child_process wrapper for Nuclei
│   ├── agent-core/             # Handwritten workflow state machine
│   ├── retrieval/              # Route-aware retrieval + pgvector query
│   └── db/                     # pgclient + migration + query functions
│
├── docs/
│   └── architecture/
│       └── first-version.md    # 架構設計文件
│
└── Project_Index.md            # 本檔案
```

---

## 3. 技術堆疊

| 類別 | 技術 | 用途 |
|------|------|------|
| 語言 | TypeScript 5.x | strict, ES2023, NodeNext |
| Monorepo | pnpm + Turborepo | workspace 管理 + 快取編譯 |
| API Server | Fastify | REST 控制面版 |
| 資料庫 | PostgreSQL + pgvector | 向量儲存 + HNSW 索引 |
| DB Client | `pg` (node-postgres) | SQL queries + connection pool |
| AI SDK | Vercel AI SDK (`ai`) | `generateText` + tool calling |
| LLM | OpenAI GPT (預設 `gpt-5`) | Executor 驗證模型 |
| Embedding | OpenAI `text-embedding-3-small` | 1536 維度向量 |
| Schema | Zod | Runtime validation + 型別推導 |
| 掃描器 | Nuclei (外部 binary) | 黑箱漏洞掃描 |

---

## 4. 套件模組定義

### 4a. `packages/contracts` — @hybrid/contracts

**依賴:** `zod`
**路徑:** `packages/contracts/src/`

| 檔案 | 匯出 | 說明 |
|------|------|------|
| `index.ts` | — | Re-exports from finding + workflow |
| `finding.ts` | `severitySchema`, `nucleiFindingSchema`, `scoutTaskSchema` | 核心資料結構: severity enum, raw Nuclei output, normalized ScoutTask |
| `finding.ts` | `Severity`, `NucleiFinding`, `ScoutTask` | 對應的 TypeScript types |
| `workflow.ts` | `workflowStatusSchema`, `workflowRunSchema` | State machine status enum, 完整 workflow run |
| `workflow.ts` | `WorkflowStatus`, `WorkflowRun` | 對應的 TypeScript types |

**關鍵型別:**
```typescript
ScoutTask = { taskId: uuid, source: "nuclei", title, severity, endpoint, route, queryParams, templateId }
WorkflowRun = { runId: uuid, status: WorkflowStatus, task: ScoutTask, notes: string[], updatedAt }
WorkflowStatus = "queued" | "scouted" | "enriched" | "hypothesis_ready" | "poc_running" | "verified" | "rejected" | "failed"
```

---

### 4b. `packages/config` — @hybrid/config

**依賴:** `zod`
**路徑:** `packages/config/src/index.ts`

| 匯出 | 說明 |
|------|------|
| `AppConfig` | Typed config interface (nodeEnv, port, nucleiPath, allowedHosts, databaseUrl, embeddingModel, executorModel, openAiApiKey) |
| `loadAppConfig(env?)` | 解析 `process.env` 透過 Zod schema，回傳 `AppConfig` |

**環境變數:**

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `NODE_ENV` | `"development"` | development / test / production |
| `PORT` | `4000` | API server port |
| `NUCLEI_PATH` | `"nuclei"` | Nuclei binary 路徑 |
| `SCANNER_ALLOWED_HOSTS` | `"localhost,127.0.0.1,::1,host.docker.internal"` | 允許掃描的 host (逗號分隔) |
| `DATABASE_URL` | (optional) | PostgreSQL connection string |
| `EMBEDDING_MODEL` | `"text-embedding-3-small"` | OpenAI embedding model |
| `EXECUTOR_MODEL` | `"openai/gpt-5"` | AI executor model |
| `OPENAI_API_KEY` | (optional) | OpenAI API key |

---

### 4c. `packages/nuclei` — @hybrid/nuclei

**依賴:** `@hybrid/contracts`
**路徑:** `packages/nuclei/src/index.ts`

| 匯出 | 說明 |
|------|------|
| `RunScoutScanParams` | `{ target, nucleiPath?, templates?, timeoutMs?, allowedHosts? }` |
| `ScoutScanResult` | `{ findings: NucleiFinding[], tasks: ScoutTask[], stderr }` |
| `runScoutScan(params)` | Spawn Nuclei process, parse JSONL output, validate + convert to ScoutTask |

**安全機制:**
- `validateTarget()` — URL protocol 限制 http/https, host allowlist check
- `findingToTask()` — 將 raw Nuclei finding 轉換為 ScoutTask
- Timeout (預設 120s)
- `shell: false` 防止 command injection

---

### 4d. `packages/agent-core` — @hybrid/agent-core

**依賴:** `@hybrid/contracts`
**路徑:** `packages/agent-core/src/state-machine.ts`

| 匯出 | 說明 |
|------|------|
| `WorkflowEvent` | Union type: `SCOUT_COMPLETED`, `CONTEXT_RETRIEVED`, `HYPOTHESIS_READY`, `POC_STARTED`, `VERIFIED`, `REJECTED`, `FAILED` |
| `applyWorkflowEvent(run, event)` | Pure function: 驗證 transition, 回傳新的 `WorkflowRun` |

**狀態轉移表:**
```
queued → [SCOUT_COMPLETED, FAILED]
scouted → [CONTEXT_RETRIEVED, FAILED]
enriched → [HYPOTHESIS_READY, FAILED]
hypothesis_ready → [POC_STARTED, FAILED]
poc_running → [VERIFIED, REJECTED, FAILED]
verified → (terminal)
rejected → (terminal)
failed → (terminal)
```

---

### 4e. `packages/retrieval` — @hybrid/retrieval

**依賴:** `@hybrid/config`, `@hybrid/contracts`, `@hybrid/db`, `openai`
**路徑:** `packages/retrieval/src/index.ts`

| 匯出 | 說明 |
|------|------|
| `RetrievalPlan` | `{ route, queryTerms, metadataFilters, maxChunks }` |
| `RetrievedChunk` | `{ chunkId, filePath, symbolName?, snippet, score, metadata }` |
| `buildRetrievalPlan(task)` | 從 ScoutTask 建立檢索計劃 (route + query params + templateId) |
| `retrieveChunks(plan)` | 產生 query embedding → 查 pgvector → 回傳 ranked chunks |
| `formatRetrievedContext(chunks)` | 格式化 chunks 為 LLM 可讀取的 prompt 文字 |

---

### 4f. `packages/db` — @hybrid/db

**依賴:** `@hybrid/config`, `pg`
**路徑:** `packages/db/src/`

| 檔案 | 匯出 | 說明 |
|------|------|------|
| `client.ts` | `getPool()`, `closePool()`, `withClient()` | pg Pool singleton, connection management |
| `queries.ts` | `insertCodeChunks()`, `queryCodeChunks()` | Code chunks CRUD + vector search |
| `queries.ts` | `createScanRun()`, `updateScanRunStatus()` | Scan run lifecycle |
| `queries.ts` | `insertScoutTask()` | Persist scout findings |
| `queries.ts` | `createVerificationRun()` | AI verification tracking |
| `migrate.ts` | — | Migration runner (CLI: `pnpm db:migrate`) |
| `index.ts` | `vectorSchemaNotes`, `CodeChunkRecord`, `ScoutTaskRecord` | 常數 + 型別定義 |

---

## 5. 應用程式模組

### 5a. `apps/api` — @hybrid/api

**功能:** Fastify HTTP server — 控制面版 + Pipeline orchestrator
**依賴:** 所有 packages + executor-worker + `ai` + `fastify` + `zod`

| 端點 | 方法 | 說明 |
|------|------|------|
| `/health` | `GET` | 回傳 service status |
| `/scan` | `POST` | 接受 `{ target: string }`, 建立 scan run, 背景執行 pipeline |
| `/scans/:id` | `GET` | 查詢 scan run 狀態 |

**Pipeline Orchestrator (`runPipeline`):**
1. Phase 1 — Scout: `@hybrid/nuclei.runScoutScan()` → insert tasks → DB
2. Phase 2 — Analyst: `@hybrid/retrieval.buildRetrievalPlan()` + `retrieveChunks()` → code context
3. Phase 3 — Executor: `verifyFinding()` → AI verification + HTTP PoC

---

### 5b. `apps/scout-worker` — @hybrid/scout-worker

**功能:** CLI — 接受 target URL, 執行 Nuclei 掃描, 輸出 JSON findings+tasks
**執行:** `pnpm dev:scout <target-url>`
**輸出:** `{ findings: number, tasks: ScoutTask[] }`

---

### 5c. `apps/analyst-worker` — @hybrid/analyst-worker

**功能:** CLI — 接受 JSON ScoutTask, 執行 retrieval plan + pgvector query, 輸出 chunks
**執行:** `pnpm dev:analyst '<json-scout-task>'`
**輸出:** `{ plan: RetrievalPlan, chunks: RetrievedChunk[] }`

---

### 5d. `apps/executor-worker` — @hybrid/executor-worker

**功能:** 匯出 `verifyFinding()` — 使用 Vercel AI SDK tool-calling + 真實 HTTP PoC
**匯出作為函式庫:** `"exports": { ".": "./src/index.ts" }`

| 匯出 | 說明 |
|------|------|
| `verifyFinding({ task, context })` | AI 驗證漏洞, 回傳 `generateText` result |
| (internal) `executeHttpPoc()` | 真實 HTTP request — host validation + 10s timeout + 4096 body truncation |
| (internal) `validatePocTarget()` | Protocol + host allowlist check |

**proposeHttpPoc tool:**
- Input: method, url, headers, body, rationale
- Execute: 用 Node.js `fetch` 真的打 target
- 回傳: status, headers, body, elapsedMs, error (if any)

---

### 5e. `apps/indexer` — @hybrid/indexer

**功能:** CLI — walk repo → chunk files → generate embeddings → insert to pgvector
**執行:** `pnpm dev:indexer [repo-path] [--clear]`

| 檔案 | 匯出 | 說明 |
|------|------|------|
| `index.ts` | `indexRepository({ repoPath, batchSize, clearExisting })` | Main orchestration |
| `chunker.ts` | `chunkFile()`, `shouldIncludePath()`, `extractRoute()` | File chunking + route detection |
| `embedder.ts` | `generateEmbedding()`, `generateEmbeddings()` | OpenAI embeddings batch API |

**Chunker 特性:**
- 支援 20+ 語言 (ts, js, go, py, rs, java, ...)
- Route pattern 偵測 (Fastify/Express/Koa style)
- File path 作為 route hint (routes/, controllers/, pages/)
- 大檔案依行數分割 (max 4000 chars per chunk)
- 排除 node_modules, .git, .turbo, dist 等目錄

---

## 6. 資料庫 Schema

### `scan_runs`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID PK | |
| target_url | TEXT | 掃描目標 |
| phase | TEXT | 當前 phase |
| status | TEXT | 狀態 (queued, scouting, scouted, analyzing, ...) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `scout_tasks`
| 欄位 | 型別 | FK | 說明 |
|------|------|----|------|
| id | UUID PK | | |
| scan_run_id | UUID | → scan_runs(id) CASCADE | |
| source | TEXT | | "nuclei" |
| title, severity, endpoint, route | TEXT | | |
| query_params | JSONB | | `[]` |
| template_id | TEXT | | Nuclei template ID |
| created_at | TIMESTAMPTZ | | |

### `code_chunks`
| 欄位 | 型別 | 索引 | 說明 |
|------|------|------|------|
| id | UUID PK | | |
| repository_path | TEXT | | |
| file_path | TEXT | | |
| route | TEXT | B-tree | nullable, route hint |
| symbol_name | TEXT | | nullable |
| language | TEXT | | |
| content | TEXT | | |
| metadata | JSONB | | `{}` |
| embedding | VECTOR(1536) | HNSW (cosine) | OpenAI embedding |
| created_at | TIMESTAMPTZ | | |

### `verification_runs`
| 欄位 | 型別 | FK | 說明 |
|------|------|----|------|
| id | UUID PK | | |
| scout_task_id | UUID | → scout_tasks(id) CASCADE | |
| status | TEXT | | "running" / ... |
| hypothesis, poc_request, outcome | JSONB | | nullable |
| created_at, updated_at | TIMESTAMPTZ | | |

---

## 7. 依賴圖

```
                         @hybrid/contracts (zod)
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
   @hybrid/config        @hybrid/nuclei      @hybrid/agent-core
     (zod)                 (contracts)         (contracts)
          │                   │
          │            @hybrid/scout-worker
          │             (config, nuclei)
          │
     @hybrid/db
  (config, pg)
          │
     @hybrid/retrieval
(config, contracts, db, openai)
          │
          ├── @hybrid/analyst-worker (contracts, retrieval)
          ├── @hybrid/indexer        (config, db, contracts, openai)
          │
     @hybrid/executor-worker (config, contracts, retrieval, ai, zod)
          │
     @hybrid/api (所有 packages + executor-worker + fastify + ai + zod)
```

**Build order:** `contracts` → `config` → `db` | `nuclei` | `agent-core` → `retrieval` → 所有 apps

---

## 8. 資料流程 (Pipeline Flow)

```
POST /scan { target }
    │
    ├─ createScanRun(id, target, "scout", "queued")
    │
    ├─ Phase 1: Scout
    │   ├─ runScoutScan({ target, nucleiPath, allowedHosts })
    │   ├─ findindings → insertScoutTask(task) × N
    │   ├─ applyWorkflowEvent(SCOUT_COMPLETED) → status = "scouted"
    │   └─ if no tasks → done
    │
    ├─ Phase 2: Analyst
    │   ├─ for each task:
    │   │   ├─ buildRetrievalPlan(task) → plan
    │   │   └─ retrieveChunks(plan)
    │   │       ├─ generateQueryEmbedding(queryTerms) → OpenAI
    │   │       └─ queryCodeChunks({ route, embedding }) → pgvector
    │   ├─ applyWorkflowEvent(CONTEXT_RETRIEVED) → "enriched"
    │   └─ applyWorkflowEvent(HYPOTHESIS_READY) → "hypothesis_ready"
    │
    └─ Phase 3: Executor
        ├─ for each task + context:
        │   ├─ createVerificationRun(id, taskId, "running")
        │   ├─ verifyFinding({ task, context })
        │   │   ├─ generateText(model, prompt, tools: { proposeHttpPoc })
        │   │   └─ AI 決定是否呼叫 executeHttpPoc(method, url, headers, body)
        │   │       └─ Node.js fetch → 回傳 response 給 AI
        │   └─ log result
        ├─ applyWorkflowEvent(POC_STARTED) → "poc_running"
        └─ applyWorkflowEvent(VERIFIED) → "verified"
```

---

## 9. 關鍵決策記錄

| 決策 | 說明 |
|------|------|
| 無 LangGraph | 狀態機手寫 (`packages/agent-core`), 純函數 + 顯式轉移表 |
| Route-aware retrieval | 優先 route match → metadata filter → vector similarity |
| Nuclei 隔離 | nuclei wrapper 無任何 AI 相關 import |
| Typed env | `@hybrid/config` 用 Zod 驗證所有環境變數 |
| pgvector HNSW | `vector_cosine_ops` 索引, 1536 維度 |
| 安全限制 | Host allowlist, `shell: false`, timeout, body truncation |
| ESM | 所有 package `"type": "module"`, `.js` extension imports |
