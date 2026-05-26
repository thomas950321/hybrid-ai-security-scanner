import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { loadAppConfig } from "@hybrid/config";
import { scoutTaskSchema } from "@hybrid/contracts";
import { formatRetrievedContext, type RetrievedChunk } from "@hybrid/retrieval";

const MAX_BODY_LENGTH = 4_096;

function validatePocTarget(url: string, allowedHosts: string[]): URL {
  const parsed = new URL(url);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(
      `Target host ${parsed.hostname} is not in the allowed hosts list`,
    );
  }

  return parsed;
}

async function executeHttpPoc(candidate: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | undefined;
}) {
  const config = loadAppConfig();
  const parsed = validatePocTarget(candidate.url, config.allowedHosts);

  const fetchInit: RequestInit = {
    method: candidate.method,
    headers: candidate.headers,
  };

  if (candidate.body != null && !["GET", "HEAD"].includes(candidate.method)) {
    fetchInit.body = candidate.body;
  }

  const startTime = performance.now();
  let response: Response;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    fetchInit.signal = controller.signal;

    response = await fetch(parsed.toString(), fetchInit);
    clearTimeout(timeout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      candidate,
    };
  }

  const elapsed = performance.now() - startTime;
  const responseBody = await response.text();
  const truncatedBody = responseBody.slice(0, MAX_BODY_LENGTH);
  const wasTruncated = responseBody.length > MAX_BODY_LENGTH;

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    success: true,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: truncatedBody,
    bodyTruncated: wasTruncated,
    elapsedMs: Math.round(elapsed),
    candidate,
  };
}

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
          "Execute an HTTP proof-of-concept request against the target. The response body is returned to inform your verification decision. Only localhost and container hosts are allowed.",
        inputSchema: z.object({
          method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
          url: z.string().url(),
          headers: z.record(z.string(), z.string()).default({}),
          body: z.string().optional(),
          rationale: z.string(),
        }),
        execute: async (candidate) => {
          return executeHttpPoc(candidate);
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
