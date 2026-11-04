import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const host = process.env.APP_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.APP_PORT || "4320");

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error("APP_PORT precisa ser uma porta válida.");
}

const next = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const child = spawn(
  process.execPath,
  [
    next,
    "start",
    "--hostname",
    host,
    "--port",
    String(port),
  ],
  {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  throw error;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
