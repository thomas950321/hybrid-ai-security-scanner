import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import {
  nucleiFindingSchema,
  type NucleiFinding,
  type ScoutTask,
} from "@hybrid/contracts";

export interface RunScoutScanParams {
  target: string;
  nucleiPath?: string;
  templates?: string[];
  timeoutMs?: number;
  allowedHosts?: string[];
}

export interface ScoutScanResult {
  findings: NucleiFinding[];
  tasks: ScoutTask[];
  stderr: string;
}

function validateTarget(target: string, allowedHosts: string[]): URL {
  const url = new URL(target);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported target protocol: ${url.protocol}`);
  }

  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(`Target host is not allowlisted: ${url.hostname}`);
  }

  return url;
}

function findingToTask(finding: NucleiFinding): ScoutTask | null {
  const matchedAt = finding["matched-at"];
  if (!matchedAt) {
    return null;
  }

  let endpoint: URL;
  try {
    endpoint = new URL(matchedAt);
  } catch {
    return null;
  }

  return {
    taskId: randomUUID(),
    source: "nuclei",
    title: finding.info?.name ?? finding["template-id"],
    severity: finding.info?.severity ?? "unknown",
    endpoint: endpoint.toString(),
    route: endpoint.pathname,
    queryParams: [...endpoint.searchParams.keys()],
    templateId: finding["template-id"],
  };
}

export async function runScoutScan(
  params: RunScoutScanParams,
): Promise<ScoutScanResult> {
  const url = validateTarget(params.target, params.allowedHosts ?? ["localhost"]);
  const child = spawn(
    params.nucleiPath ?? "nuclei",
    [
      "-target",
      url.toString(),
      "-j",
      "-silent",
      "-or",
      "-pt",
      "http",
      "-severity",
      "low,medium,high,critical",
      ...(params.templates ?? []).flatMap((template) => ["-t", template]),
    ],
    {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (!child.stdout || !child.stderr) {
    throw new Error("Failed to capture Nuclei output streams.");
  }

  const findings: NucleiFinding[] = [];
  const tasks: ScoutTask[] = [];
  const stderrChunks: string[] = [];

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrChunks.push(chunk);
  });

  const lineReader = createInterface({ input: child.stdout });
  lineReader.on("line", (line) => {
    if (!line.trim()) {
      return;
    }

    try {
      const parsed = nucleiFindingSchema.parse(JSON.parse(line));
      findings.push(parsed);

      const task = findingToTask(parsed);
      if (task) {
        tasks.push(task);
      }
    } catch (error) {
      stderrChunks.push(
        `Failed to parse Nuclei JSONL line: ${(error as Error).message}\n`,
      );
    }
  });

  const timeout = setTimeout(() => {
    child.kill();
  }, params.timeoutMs ?? 120_000);

  const [exitCode] = (await once(child, "close")) as [number | null];
  await once(lineReader, "close");
  clearTimeout(timeout);

  if (exitCode !== 0) {
    throw new Error(
      `Nuclei exited with code ${exitCode ?? "unknown"}\n${stderrChunks.join("")}`,
    );
  }

  return {
    findings,
    tasks,
    stderr: stderrChunks.join(""),
  };
}

