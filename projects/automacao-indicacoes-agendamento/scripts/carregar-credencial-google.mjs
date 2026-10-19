import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export function carregarCredencialGoogleNoAmbiente() {
  const caminhoInformado = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!caminhoInformado) {
    throw new Error("Variável obrigatória ausente: GOOGLE_SERVICE_ACCOUNT_FILE.");
  }

  const caminho = isAbsolute(caminhoInformado)
    ? caminhoInformado
    : resolve(process.cwd(), caminhoInformado);
  if (!existsSync(caminho)) {
    throw new Error(
      `Arquivo da conta de serviço do Google não encontrado: ${caminho}`,
    );
  }

  const conteudo = readFileSync(caminho, "utf8");
  let credenciais;
  try {
    credenciais = JSON.parse(conteudo);
  } catch {
    throw new Error("O arquivo da conta de serviço do Google não é um JSON válido.");
  }

  if (!credenciais?.client_email || !credenciais?.private_key) {
    throw new Error("O JSON informado não contém uma conta de serviço válida.");
  }

  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(
    conteudo,
    "utf8",
  ).toString("base64");
}
