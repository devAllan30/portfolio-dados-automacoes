import { obterAccessTokenRd } from "../banco-oauth-rd";

const URL_BASE_RD = "https://api.rd.services/crm/v2";

type RespostaRd<T> = { data: T; errors?: unknown[] };

export type NegociacaoRd = {
  id: string;
  name?: string;
  status?: "ongoing" | "won" | "lost";
  owner_id?: string | null;
  pipeline_id?: string;
  stage_id?: string;
  organization_id?: string;
  contact_ids?: string[];
};

export type ContatoRd = {
  id: string;
  name?: string;
  job_title?: string;
  organization_id?: string;
  emails?: Array<{ email?: string; type?: string }>;
  phones?: Array<{ phone?: string; type?: string }>;
};

export type EmpresaRd = { id: string; name?: string };
export type UsuarioRd = { id: string; name: string; email?: string };
type EquipeRd = { id: string; name?: string; user_ids?: string[] };
type RegistroRd = { id: string };
type CampoPersonalizadoRd = {
  id: string;
  name?: string;
  slug?: string;
  type?: string;
  entity?: string;
  options?: string[];
};

export class ErroRdV2 extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
    public readonly caminho: string,
    public readonly detalhes: string,
  ) {
    super(mensagem);
  }
}

function resumirErros(erros: unknown) {
  if (!Array.isArray(erros) || erros.length === 0) return "Sem detalhes adicionais.";
  return erros.map((erro) => {
    if (!erro || typeof erro !== "object") return String(erro);
    const item = erro as Record<string, unknown>;
    return String(item.detail ?? item.message ?? item.title ?? JSON.stringify(item));
  }).join(" | ").slice(0, 1_000);
}

function normalizarOpcao(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export class ClienteRdV2 {
  private constructor(private accessToken: string) {}

  static async criar() {
    return new ClienteRdV2(await obterAccessTokenRd());
  }

  private async executar<T>(caminho: string, opcoes?: RequestInit) {
    const requisitar = (token: string) => fetch(`${URL_BASE_RD}${caminho}`, {
      ...opcoes,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(opcoes?.body ? { "Content-Type": "application/json" } : {}),
        ...opcoes?.headers,
      },
    });

    let resposta = await requisitar(this.accessToken);
    if (resposta.status === 401) {
      this.accessToken = await obterAccessTokenRd(this.accessToken);
      resposta = await requisitar(this.accessToken);
    }
    const conteudo = (await resposta.json().catch(() => ({}))) as RespostaRd<T>;
    if (!resposta.ok) {
      throw new ErroRdV2(
        resposta.status,
        `O RD Station recusou a solicitação (${resposta.status}).`,
        caminho,
        resumirErros(conteudo.errors),
      );
    }
    return conteudo.data;
  }

  obterNegociacao(id: string) {
    return this.executar<NegociacaoRd>(`/deals/${encodeURIComponent(id)}`);
  }

  obterContato(id: string) {
    return this.executar<ContatoRd>(`/contacts/${encodeURIComponent(id)}`);
  }

  obterEmpresa(id: string) {
    return this.executar<EmpresaRd>(`/organizations/${encodeURIComponent(id)}`);
  }

  obterUsuario(id: string) {
    return this.executar<UsuarioRd>(`/users/${encodeURIComponent(id)}`);
  }

  async obterUsuariosEquipe(idEquipe: string) {
    const equipe = await this.executar<EquipeRd>(`/teams/${encodeURIComponent(idEquipe)}`);
    const usuarios = await Promise.all((equipe.user_ids ?? []).map((id) => this.obterUsuario(id)));
    return usuarios.filter((usuario) => usuario?.id && usuario?.name)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  async obterOpcaoCampoNegociacao(idCampo: string, valor: string) {
    const caminho = `/custom_fields/${encodeURIComponent(idCampo)}`;
    const campo = await this.executar<CampoPersonalizadoRd>(caminho);
    if (!campo.slug || campo.entity !== "deal" || campo.type !== "option") {
      throw new ErroRdV2(
        422,
        "Campo personalizado incompatível com a integração.",
        caminho,
        "O campo informado não é uma lista de opções da negociação.",
      );
    }
    const comparacao = normalizarOpcao(valor);
    const opcao = campo.options?.find(
      (item) => normalizarOpcao(item) === comparacao,
    );
    if (!opcao) {
      throw new ErroRdV2(
        422,
        "O pré-vendedor não está cadastrado no campo da negociação.",
        caminho,
        `A opção correspondente a ${valor} não foi encontrada no RD.`,
      );
    }
    return { slug: campo.slug, valor: opcao };
  }

  atualizarNegociacaoAposAgendamento(
    idNegociacao: string,
    idResponsavel: string,
    idEtapa: string,
    camposPersonalizados: Record<string, string>,
  ) {
    return this.executar<NegociacaoRd>(`/deals/${encodeURIComponent(idNegociacao)}`, {
      method: "PUT",
      body: JSON.stringify({
        data: {
          owner_id: idResponsavel,
          stage_id: idEtapa,
          custom_fields: camposPersonalizados,
        },
      }),
    });
  }

  criarAnotacaoNegociacao(idNegociacao: string, descricao: string) {
    return this.executar<RegistroRd>(`/deals/${encodeURIComponent(idNegociacao)}/notes`, {
      method: "POST",
      body: JSON.stringify({ data: { description: descricao } }),
    });
  }

  criarTarefaReuniao(dados: {
    idNegociacao: string;
    nome: string;
    descricao: string;
    dataHoraIso: string;
    idCriador: string;
  }) {
    return this.executar<RegistroRd>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: dados.nome,
          description: dados.descricao,
          type: "meeting",
          status: "open",
          due_date: dados.dataHoraIso,
          deal_id: dados.idNegociacao,
          created_by_id: dados.idCriador,
          owner_ids: [dados.idCriador],
        },
      }),
    });
  }
}
