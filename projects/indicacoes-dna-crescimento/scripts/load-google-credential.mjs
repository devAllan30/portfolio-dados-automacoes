import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export function loadGoogleCredentialIntoEnvironment() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim()) return;

  const configuredPath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!configuredPath) return;
  const credentialPath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), configuredPath);
  if (!existsSync(credentialPath)) {
    throw new Error(
      `Arquivo da conta de serviço do Google não encontrado: ${credentialPath}`,
    );
  }

  const raw = readFileSync(credentialPath, "utf8");
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("O arquivo da conta de serviço do Google não é um JSON válido.");
  }
  if (!credentials?.client_email || !credentials?.private_key) {
    throw new Error("O JSON informado não contém uma conta de serviço válida.");
  }
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(
    raw,
    "utf8",
  ).toString("base64");
}
