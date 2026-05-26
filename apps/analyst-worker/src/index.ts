import { scoutTaskSchema } from "@hybrid/contracts";
import { buildRetrievalPlan, retrieveChunks } from "@hybrid/retrieval";
import { closePool } from "@hybrid/db";

async function main() {
  const raw = process.argv[2];

  if (!raw) {
    throw new Error("Pass a JSON encoded ScoutTask as the first argument.");
  }

  const task = scoutTaskSchema.parse(JSON.parse(raw));
  const plan = buildRetrievalPlan(task);
  const chunks = await retrieveChunks(plan);

  console.log(JSON.stringify({ plan, chunks }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => {
  closePool().catch(() => {});
});

