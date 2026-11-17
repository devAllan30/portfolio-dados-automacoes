import { ClienteRdV2 } from "./rd-station-v2";
import { emailValido, normalizarEmail } from "./validacao-emails";

const ID_FUNIL = "678fab56b5999f0014422fe8";
const ETAPAS_APTAS = new Set([
  "678fab56b5999f0014422fea",
  "6aa2bc9ac7ee9a0022d0a12b",
  "678fab56b5999f0014422feb",
  "68a72f47c8bf100017c2ad32",
]);

export class ErroContextoNegociacao extends Error {
  constructor(mensagem: string, public readonly status = 422) { super(mensagem); }
}

export async function carregarContextoNegociacao(idNegociacao: string, rdRecebido?: ClienteRdV2) {
  if (!/^[0-9a-f]{24}$/i.test(idNegociacao)) {
    throw new ErroContextoNegociacao("O identificador da negociação é inválido.", 400);
  }
  const rd = rdRecebido ?? await ClienteRdV2.criar();
  const negociacao = await rd.obterNegociacao(idNegociacao);
  if (negociacao.pipeline_id !== ID_FUNIL) {
    console.warn("Negociação fora do funil configurado.", {
      negociacao_id: negociacao.id,
      funil_recebido: negociacao.pipeline_id ?? null,
      funil_esperado: ID_FUNIL,
      etapa_recebida: negociacao.stage_id ?? null,
    });
    throw new ErroContextoNegociacao("Esta negociação não pertence ao funil de agendamento SST.", 403);
  }
  if (!negociacao.stage_id || !ETAPAS_APTAS.has(negociacao.stage_id)) {
    console.warn("Negociação em etapa não apta para agendamento.", {
      negociacao_id: negociacao.id,
      etapa_recebida: negociacao.stage_id ?? null,
    });
    throw new ErroContextoNegociacao(
      "A etapa atual da negociação não permite realizar o agendamento.",
      409,
    );
  }
  const [empresa, contatos, preVendedor] = await Promise.all([
    negociacao.organization_id ? rd.obterEmpresa(negociacao.organization_id) : Promise.resolve(null),
    Promise.all((negociacao.contact_ids ?? []).map((id) => rd.obterContato(id))),
    negociacao.owner_id ? rd.obterUsuario(negociacao.owner_id) : Promise.resolve(null),
  ]);
  const contatosNormalizados = contatos.map((contato) => ({
    id: contato.id,
    nome: contato.name?.trim() || "Contato sem nome",
    cargo: contato.job_title?.trim() || "",
    telefones: Array.from(new Set((contato.phones ?? []).map((item) => item.phone?.trim()).filter((item): item is string => Boolean(item)))),
    emails: Array.from(new Set((contato.emails ?? []).map((item) => normalizarEmail(item.email ?? "")).filter(emailValido))),
  }));
  const emails = Array.from(new Set(contatosNormalizados.flatMap((contato) => contato.emails)));
  if (emails.length === 0) {
    throw new ErroContextoNegociacao("Nenhum e-mail válido foi encontrado nos contatos desta negociação.");
  }
  return {
    negociacao: {
      id: negociacao.id,
      nome: negociacao.name?.trim() || "Negociação sem nome",
      status: negociacao.status ?? "ongoing",
      empresa: empresa ? { id: empresa.id, nome: empresa.name?.trim() || "Empresa sem nome" } : null,
      pre_vendedor: preVendedor
        ? { id: preVendedor.id, nome: preVendedor.name.trim() }
        : null,
      contatos: contatosNormalizados,
      emails,
    },
    rd,
  };
}
