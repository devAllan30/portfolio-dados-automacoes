import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { projectRoot } from "./sites-env.mjs";

const host = process.env.APP_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.APP_PORT || "4318");

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error("APP_PORT precisa ser uma porta válida.");
}

const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const envFile = fileURLToPath(new URL("../.env.local", import.meta.url));
const child = spawn(
  process.execPath,
  [
    wrangler,
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--local",
    "--persist-to",
    ".wrangler/state",
    "--env-file",
    envFile,
    "--ip",
    host,
    "--port",
    String(port),
    "--inspector-port",
    "0",
  ],
  { cwd: projectRoot, env: process.env, stdio: "inherit" },
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
