import Fastify from "fastify";

import { loadAppConfig } from "@hybrid/config";

const config = loadAppConfig();
const app = Fastify({ logger: true });

app.get("/health", async () => {
  return {
    ok: true,
    service: "api",
    phaseStrategy: ["scout", "analyst", "executor"],
  };
});

app.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

