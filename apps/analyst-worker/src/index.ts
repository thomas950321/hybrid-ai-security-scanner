import { scoutTaskSchema } from "@hybrid/contracts";
import { buildRetrievalPlan } from "@hybrid/retrieval";

async function main() {
  const raw = process.argv[2];

  if (!raw) {
    throw new Error("Pass a JSON encoded ScoutTask as the first argument.");
  }

  const task = scoutTaskSchema.parse(JSON.parse(raw));
  const plan = buildRetrievalPlan(task);

  console.log(JSON.stringify(plan, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

