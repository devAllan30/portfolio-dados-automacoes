import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { carregarCredencialGoogleNoAmbiente } from "./carregar-credencial-google.mjs";

const arquivoAmbiente = fileURLToPath(
  new URL("../.env.local", import.meta.url),
);
if (existsSync(arquivoAmbiente)) {
  process.loadEnvFile(arquivoAmbiente);
}
carregarCredencialGoogleNoAmbiente();

const executavelVinext = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);
const argumentosRecebidos = process.argv
  .slice(2)
  .filter((argumento) => argumento !== "--");
const servidor = spawn(
  process.execPath,
  [executavelVinext, "dev", ...argumentosRecebidos],
  {
    env: process.env,
    stdio: "inherit",
  },
);

for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => {
    if (!servidor.killed) servidor.kill(sinal);
  });
}

servidor.on("exit", (codigo, sinal) => {
  if (sinal) {
    process.kill(process.pid, sinal);
    return;
  }
  process.exit(codigo ?? 1);
});
