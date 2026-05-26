# First-Version Architecture

## Goal

Ship a narrow, controllable first version that combines:

- `Nuclei` for high-throughput black-box signal generation
- route-aware code retrieval for white-box context
- Vercel AI SDK for model/tool abstraction
- a handwritten state machine for explicit orchestration

## Why this shape

- A single AI framework should not own both orchestration and model execution.
- Phase boundaries need typed contracts so workers can be replaced independently.
- The first version should optimize for auditability and false-positive reduction, not autonomy breadth.

## Phase boundaries

### Phase 1: Scout

- Input: local target URL
- Output: normalized `ScoutTask[]`
- Implementation: `apps/scout-worker` + `packages/nuclei`

### Phase 2: Analyst

- Input: `ScoutTask`
- Output: retrieval plan and route-aware code context
- Implementation: `apps/analyst-worker` + `packages/retrieval` + `packages/db`

### Phase 3: Executor

- Input: `ScoutTask` + retrieved code chunks
- Output: verified / rejected decision and PoC candidate
- Implementation: `apps/executor-worker` + Vercel AI SDK + `packages/agent-core`

## Orchestration model

The first version uses a handwritten finite state machine:

- `queued`
- `scouted`
- `enriched`
- `hypothesis_ready`
- `poc_running`
- `verified`
- `rejected`
- `failed`

This is deliberate. It keeps retry, resume, and cost accounting explicit before introducing a durable workflow engine such as Temporal.

## Retrieval strategy

Retrieval is not pure vector search. Query planning should prefer:

1. route match
2. file/module metadata filters
3. query parameter names
4. vector similarity
5. reranking

This matters for APIs with similar controller shapes where semantic similarity alone retrieves the wrong route.
