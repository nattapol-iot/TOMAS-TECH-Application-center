import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const hosts = [...new Set(config.host.split(";").map((host) => host.trim()).filter(Boolean))];
if (hosts.length === 0) throw new Error("At least one API listen address is required.");
const applications: Array<Awaited<ReturnType<typeof buildApp>>> = [];

const shutdown = async (signal: string): Promise<void> => {
  applications[0]?.app.log.info({ signal }, "Stopping IoT Team Center Node API");
  await Promise.all(applications.map(({ app }) => app.close()));
  process.exit(0);
};

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

try {
  for (const host of hosts) {
    const application = await buildApp({ ...config, host });
    await application.app.listen({ host, port: config.port });
    applications.push(application);
  }
} catch (error) {
  await Promise.all(applications.map(({ app }) => app.close()));
  throw error;
}
