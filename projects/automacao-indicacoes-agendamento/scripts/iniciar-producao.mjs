import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { carregarCredencialGoogleNoAmbiente } from "./carregar-credencial-google.mjs";

const arquivoAmbiente = fileURLToPath(
  new URL("../.env.production", import.meta.url),
);

if (existsSync(arquivoAmbiente)) {
  process.loadEnvFile(arquivoAmbiente);
}

const variaveisObrigatorias = [
  "MYSQL_HOST",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MYSQL_DATABASE",
  "RD_CLIENT_ID",
  "RD_CLIENT_SECRET",
  "RD_CRM_V1_TOKEN",
  "RD_CAMPO_PARCEIRO_EMPRESA",
  "RD_CAMPO_CONSULTOR_NEGOCIACAO",
  "RD_CAMPO_DOCUMENTO_CLIENTE",
  "RD_CAMPO_PRE_VENDEDOR_B2B",
  "RD_OPCAO_PRE_VENDEDOR_B2B",
  "RD_CAMPO_QUANTIDADE_CLIENTES",
  "RD_CAMPO_CURVA_PARCEIRO",
  "RD_CAMPO_SETOR_PARCEIRO",
  "RD_CAMPO_DOCUMENTO_PARCEIRO",
  "RD_ETAPA_INDICACAO",
  "RD_EQUIPE_INDICACAO",
  "RD_CAMPANHA_INDICACAO",
  "RD_FUNIL_AGENDAMENTO",
  "RD_ETAPA_AGENDAMENTO",
  "RD_EQUIPE_CLOSER",
  "RD_CAMPANHA_AGENDAMENTO",
  "GOOGLE_SERVICE_ACCOUNT_FILE",
];

const variaveisAusentes = variaveisObrigatorias.filter(
  (nome) => !process.env[nome]?.trim(),
);

if (variaveisAusentes.length > 0) {
  console.error(
    `Configuracao de producao incompleta. Preencha: ${variaveisAusentes.join(", ")}.`,
  );
  process.exit(1);
}

try {
  carregarCredencialGoogleNoAmbiente();
} catch (erro) {
  console.error(
    erro instanceof Error
      ? erro.message
      : "Não foi possível carregar a credencial do Google Agenda.",
  );
  process.exit(1);
}

const host = process.env.APP_HOST?.trim() || "127.0.0.1";
const porta = Number(process.env.APP_PORT || "4318");

if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
  console.error("APP_PORT deve ser uma porta valida entre 1 e 65535.");
  process.exit(1);
}

process.env.NODE_ENV = "production";
process.env.RD_OAUTH_TOKEN_URL ||= "https://api.rd.services/oauth2/token";
process.env.MYSQL_PORT ||= "3306";

const executavelVinext = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);

const servidor = spawn(
  process.execPath,
  [
    executavelVinext,
    "start",
    "--hostname",
    host,
    "--port",
    String(porta),
  ],
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

servidor.on("error", (erro) => {
  console.error(`Nao foi possivel iniciar o servidor: ${erro.message}`);
  process.exit(1);
});

servidor.on("exit", (codigo, sinal) => {
  if (sinal) {
    process.kill(process.pid, sinal);
    return;
  }
  process.exit(codigo ?? 1);
});
