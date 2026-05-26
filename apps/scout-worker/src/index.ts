import { loadAppConfig } from "@hybrid/config";
import { runScoutScan } from "@hybrid/nuclei";

async function main() {
  const config = loadAppConfig();
  const target = process.argv[2];

  if (!target) {
    throw new Error("Usage: pnpm dev:scout <target-url>");
  }

  const result = await runScoutScan({
    target,
    nucleiPath: config.nucleiPath,
    allowedHosts: config.allowedHosts,
  });

  console.log(
    JSON.stringify(
      {
        findings: result.findings.length,
        tasks: result.tasks,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

