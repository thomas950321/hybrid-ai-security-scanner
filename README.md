# Hybrid AI Security Scanner

First-version scaffold for a layered security testing system:

- Phase 1: `Nuclei` drives black-box discovery.
- Phase 2: route-aware retrieval pulls relevant source context from a pgvector-backed code index.
- Phase 3: an AI executor uses Vercel AI SDK tool-calling on top of a handwritten state machine.

## Workspace layout

- `apps/api`: control plane and health endpoints
- `apps/scout-worker`: Nuclei runner and finding normalization
- `apps/analyst-worker`: retrieval planning for code-aware analysis
- `apps/executor-worker`: AI verification scaffold
- `packages/contracts`: shared zod schemas and event contracts
- `packages/config`: typed environment loading
- `packages/nuclei`: safe `child_process.spawn()` wrapper around Nuclei
- `packages/agent-core`: handwritten workflow state machine
- `packages/retrieval`: route-aware retrieval planning helpers
- `packages/db`: pgvector-ready schema and persistence helpers

## Quick start

```bash
pnpm install
pnpm typecheck
pnpm dev:api
```

## Design constraints

- `Nuclei` remains isolated from AI logic.
- The executor does not directly control workflow state.
- RAG retrieval is route-aware, not pure similarity search.
- The first version intentionally avoids LangGraph to keep orchestration explicit.

