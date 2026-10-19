import { type RowDataPacket } from "mysql2/promise";
import { abrirConexaoMySql } from "./banco-oauth-rd";

const URL_BASE_RD_V1 = "https://crm.rdstation.com/api/v1";
const NOME_LOCK_OPCAO_CONSULTOR = "indicacao_opcao_consultor_rd";

type CampoPersonalizadoV1 = {
  id?: string;
  _id?: string;
  allow_new?: boolean;
  for?: string;
  label?: string;
  opts?: string[];
  order?: number;
  required?: boolean;
  type?: string;
  unique?: boolean;
};

function tokenV1() {
  const token = process.env.RD_CRM_V1_TOKEN?.trim();
  if (!token) {
    throw new Error("A credencial RD_CRM_V1_TOKEN não está configurada.");
  }
  return token;
}

function prepararNomeOpcao(nome: string) {
  return nome.normalize("NFC").replace(/\s+/g, " ").trim();
}

function compararNomeOpcao(nome: string) {
  return prepararNomeOpcao(nome)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

async function executarV1<T>(caminho: string, opcoes?: RequestInit) {
  const url = new URL(`${URL_BASE_RD_V1}${caminho}`);
  url.searchParams.set("token", tokenV1());
  const resposta = await fetch(url, {
    ...opcoes,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(opcoes?.body ? { "Content-Type": "application/json" } : {}),
      ...opcoes?.headers,
    },
  });
  const conteudo = (await resposta.json().catch(() => ({}))) as T;

  if (!resposta.ok) {
    throw new Error(`O RD Station recusou a configuração do campo (${resposta.status}).`);
  }

  return conteudo;
}

async function obterCampo(idCampo: string) {
  return executarV1<CampoPersonalizadoV1>(
    `/custom_fields/${encodeURIComponent(idCampo)}`,
  );
}

export async function garantirOpcaoCampoConsultor(
  idCampo: string,
  nomeRecebido: string,
) {
  const nome = prepararNomeOpcao(nomeRecebido);
  if (!nome || nome.length > 255 || /[\u0000-\u001F\u007F]/.test(nome)) {
    throw new Error("O nome do consultor informado no link é inválido.");
  }

  const conexao = await abrirConexaoMySql();
  let lockObtido = false;

  try {
    const [linhas] = await conexao.query<RowDataPacket[]>(
      "SELECT GET_LOCK(?, 15) AS obtido",
      [NOME_LOCK_OPCAO_CONSULTOR],
    );
    lockObtido = Number(linhas[0]?.obtido) === 1;
    if (!lockObtido) {
      throw new Error("Não foi possível reservar a configuração do campo de consultor.");
    }

    const campo = await obterCampo(idCampo);
    if (campo.for !== "deal" || campo.type !== "option") {
      throw new Error("O campo de consultor não é uma lista de opções da negociação.");
    }

    const opcoesAtuais = Array.isArray(campo.opts)
      ? campo.opts.filter((opcao): opcao is string => typeof opcao === "string")
      : [];
    const nomeComparacao = compararNomeOpcao(nome);
    const opcaoExistente = opcoesAtuais.find(
      (opcao) => compararNomeOpcao(opcao) === nomeComparacao,
    );

    if (opcaoExistente) {
      return { valorOpcao: opcaoExistente, criada: false };
    }

    await executarV1<CampoPersonalizadoV1>(
      `/custom_fields/${encodeURIComponent(idCampo)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          custom_field: {
            allow_new: campo.allow_new ?? false,
            for: campo.for,
            label: campo.label,
            opts: [...opcoesAtuais, nome],
            order: campo.order ?? 0,
            required: campo.required ?? false,
            type: campo.type,
            unique: campo.unique ?? false,
          },
        }),
      },
    );

    const campoConfirmado = await obterCampo(idCampo);
    const opcaoConfirmada = campoConfirmado.opts?.find(
      (opcao) => compararNomeOpcao(opcao) === nomeComparacao,
    );
    if (!opcaoConfirmada) {
      throw new Error("A nova opção de consultor não foi confirmada no RD Station.");
    }

    return { valorOpcao: opcaoConfirmada, criada: true };
  } finally {
    if (lockObtido) {
      await conexao
        .query("SELECT RELEASE_LOCK(?)", [NOME_LOCK_OPCAO_CONSULTOR])
        .catch(() => undefined);
    }
    await conexao.end();
  }
}
