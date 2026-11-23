import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const origem = fileURLToPath(
  new URL("../deploy/windows/web.config", import.meta.url),
);
const destino = fileURLToPath(
  new URL("../dist/client/web.config", import.meta.url),
);
const pastaDestino = fileURLToPath(
  new URL("../dist/client/", import.meta.url),
);

await mkdir(pastaDestino, { recursive: true });
await copyFile(origem, destino);

console.log("web.config do IIS copiado para dist/client.");
