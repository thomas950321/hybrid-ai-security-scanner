import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { loadAppConfig } from "@hybrid/config";
import { scoutTaskSchema } from "@hybrid/contracts";
import { formatRetrievedContext, type RetrievedChunk } from "@hybrid/retrieval";

export async function verifyFinding(input: {
  task: unknown;
  context: RetrievedChunk[];
}): Promise<unknown> {
  const config = loadAppConfig();
  const task = scoutTaskSchema.parse(input.task);

  const result = await generateText({
    model: config.executorModel,
    prompt: [
      "You are verifying whether a potential web vulnerability is real.",
      "Use the provided route-level source context and decide whether to request an attack attempt.",
      `Finding title: ${task.title}`,
      `Severity: ${task.severity}`,
      `Endpoint: ${task.endpoint}`,
      `Route: ${task.route}`,
      "",
      "Retrieved code context:",
      formatRetrievedContext(input.context),
    ].join("\n"),
    stopWhen: stepCountIs(4),
    tools: {
      proposeHttpPoc: tool({
        description:
          "Generate a candidate HTTP proof-of-concept request for the finding under review.",
        inputSchema: z.object({
          method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
          url: z.string().url(),
          headers: z.record(z.string(), z.string()).default({}),
          body: z.string().optional(),
          rationale: z.string(),
        }),
        execute: async (candidate) => {
          return {
            accepted: true,
            candidate,
          };
        },
      }),
    },
  });

  return result;
}

async function main() {
  console.log(
    "Executor scaffold ready. Import verifyFinding() from this worker once retrieval output is wired in.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
