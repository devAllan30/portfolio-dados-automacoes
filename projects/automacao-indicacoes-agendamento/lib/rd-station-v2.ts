import { obterAccessTokenRd } from "./banco-oauth-rd";

const URL_BASE_RD = "https://api.rd.services/crm/v2";
const ID_CAMPANHA_INDICACOES =
  process.env.RD_CAMPANHA_INDICACAO?.trim() || "";
const NOME_SEGMENTO_ECOSSISTEMA = "ECOSSISTEMA";
const slugsCampos = new Map<string, string>();
let idSegmentoEcossistema: string | null = null;

type RespostaRd<T> = {
  data: T;
  links?: Record<string, string | null>;
  errors?: unknown[];
};

type CampoPersonalizado = {
  id: string;
  name?: string;
  slug: string;
  type?: string;
  entity: string;
  options?: string[];
};

export type EmpresaRd = {
  id: string;
  name: string;
  segment_ids?: string[];
  custom_fields?: Record<string, unknown>;
};

type SegmentoRd = {
  id: string;
  name: string;
};

export type ContatoRd = {
  id: string;
};

export type NegociacaoRd = {
  id: string;
  name?: string;
  status?: "ongoing" | "won" | "lost";
  owner_id?: string | null;
  campaign_id?: string | null;
  pipeline_id?: string;
  stage_id?: string;
  organization_id?: string;
  contact_ids?: string[];
  updated_at?: string;
};

export type AnotacaoRd = {
  id: string;
};

export type TarefaRd = {
  id: string;
};

export type EquipeRd = {
  id: string;
  name: string;
  user_ids?: string[];
};

export type UsuarioRd = {
  id: string;
  name: string;
  email?: string;
};

export class ErroRdV2 extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
    public readonly caminho: string,
    public readonly detalhes: string,
    public readonly errosOriginais: unknown[] = [],
  ) {
    super(mensagem);
  }
}

function resumirErrosRd(erros: unknown) {
  if (!Array.isArray(erros) || erros.length === 0) return "Sem detalhes adicionais.";

  const detalhes = erros
    .map((erro) => {
      if (!erro || typeof erro !== "object") return String(erro);
      const registro = erro as Record<string, unknown>;
      return String(
        registro.detail ??
          registro.message ??
          registro.title ??
          JSON.stringify(registro),
      );
    })
    .filter(Boolean)
    .join(" | ");

  return detalhes.slice(0, 1_000) || "Sem detalhes adicionais.";
}

function compararOpcao(valor: string) {
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
    const fazerRequisicao = (token: string) =>
      fetch(`${URL_BASE_RD}${caminho}`, {
        ...opcoes,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(opcoes?.body ? { "Content-Type": "application/json" } : {}),
          ...opcoes?.headers,
        },
      });

    let resposta = await fazerRequisicao(this.accessToken);

    if (resposta.status === 401) {
      this.accessToken = await obterAccessTokenRd(this.accessToken);
      resposta = await fazerRequisicao(this.accessToken);
    }

    const conteudo = (await resposta.json().catch(() => ({}))) as RespostaRd<T>;

    if (!resposta.ok) {
      throw new ErroRdV2(
        resposta.status,
        `O RD Station recusou a solicitação (${resposta.status}).`,
        caminho,
        resumirErrosRd(conteudo.errors),
        Array.isArray(conteudo.errors) ? conteudo.errors : [],
      );
    }

    return conteudo;
  }

  async obterSlugCampo(idCampo: string, entidade: "organization" | "deal") {
    const slugSalvo = slugsCampos.get(idCampo);
    if (slugSalvo) return slugSalvo;

    const resposta = await this.executar<CampoPersonalizado>(
      `/custom_fields/${encodeURIComponent(idCampo)}`,
    );

    if (!resposta.data?.slug || resposta.data.entity !== entidade) {
      throw new ErroRdV2(
        422,
        "Campo personalizado incompatível com a integração.",
        `/custom_fields/${encodeURIComponent(idCampo)}`,
        "O campo retornado não pertence à entidade esperada.",
      );
    }

    slugsCampos.set(idCampo, resposta.data.slug);
    return resposta.data.slug;
  }

  async obterOpcaoCampoNegociacao(idCampo: string, valorRecebido: string) {
    const caminho = `/custom_fields/${encodeURIComponent(idCampo)}`;
    const resposta = await this.executar<CampoPersonalizado>(caminho);
    const campo = resposta.data;

    if (!campo?.slug || campo.entity !== "deal" || campo.type !== "option") {
      throw new ErroRdV2(
        422,
        "Campo personalizado incompatível com a integração.",
        caminho,
        "O campo informado não é uma lista de opções da negociação.",
      );
    }

    const valorComparacao = compararOpcao(valorRecebido);
    const opcao = campo.options?.find(
      (valor) => compararOpcao(valor) === valorComparacao,
    );

    if (!opcao) {
      throw new ErroRdV2(
        422,
        "Opção do campo personalizado não localizada.",
        caminho,
        `O valor "${valorRecebido}" não existe nas opções de ${campo.name ?? "campo personalizado"}.`,
      );
    }

    slugsCampos.set(idCampo, campo.slug);
    return { slug: campo.slug, valor: opcao };
  }

  async buscarEmpresasPorCampo(slugCampo: string, valor: string) {
    const parametros = new URLSearchParams({
      filter: `@${slugCampo}:${valor}`,
      "page[number]": "1",
      "page[size]": "2",
    });

    const resposta = await this.executar<EmpresaRd[]>(
      `/organizations?${parametros.toString()}`,
    );
    return resposta.data ?? [];
  }

  private async obterIdSegmentoEcossistema() {
    if (idSegmentoEcossistema) return idSegmentoEcossistema;

    const parametros = new URLSearchParams({
      filter: `name:${NOME_SEGMENTO_ECOSSISTEMA}`,
      "page[number]": "1",
      "page[size]": "20",
    });
    const caminho = `/segments?${parametros.toString()}`;
    const resposta = await this.executar<SegmentoRd[]>(caminho);
    const segmentos = (resposta.data ?? []).filter(
      (segmento) =>
        compararOpcao(segmento.name) ===
        compararOpcao(NOME_SEGMENTO_ECOSSISTEMA),
    );

    if (segmentos.length !== 1) {
      throw new ErroRdV2(
        422,
        "Não foi possível identificar o segmento ECOSSISTEMA no RD Station.",
        caminho,
        segmentos.length === 0
          ? "O segmento ECOSSISTEMA não foi encontrado."
          : "Mais de um segmento com o nome ECOSSISTEMA foi encontrado.",
      );
    }

    idSegmentoEcossistema = segmentos[0].id;
    return idSegmentoEcossistema;
  }

  async garantirSegmentoEcossistema(empresaRecebida: EmpresaRd) {
    const idSegmento = await this.obterIdSegmentoEcossistema();
    const caminho = `/organizations/${encodeURIComponent(empresaRecebida.id)}`;
    const empresa = Array.isArray(empresaRecebida.segment_ids)
      ? empresaRecebida
      : (await this.executar<EmpresaRd>(caminho)).data;
    const segmentosAtuais = empresa.segment_ids ?? [];

    if (segmentosAtuais.includes(idSegmento)) return empresa;

    const resposta = await this.executar<EmpresaRd>(caminho, {
      method: "PUT",
      body: JSON.stringify({
        data: {
          segment_ids: [...new Set([...segmentosAtuais, idSegmento])],
        },
      }),
    });
    return resposta.data;
  }

  async criarEmpresa(dados: {
    nome: string;
    slugCampoParceiro: string;
    idParceiro: string;
    idResponsavel: string;
  }) {
    const idSegmento = await this.obterIdSegmentoEcossistema();
    const resposta = await this.executar<EmpresaRd>("/organizations", {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: dados.nome,
          owner_id: dados.idResponsavel,
          segment_ids: [idSegmento],
          custom_fields: {
            [dados.slugCampoParceiro]: dados.idParceiro,
          },
        },
      }),
    });
    return resposta.data;
  }

  async buscarNegociacoesEmpresaNoFunil(
    idEmpresa: string,
    idFunil: string,
  ) {
    const parametros = new URLSearchParams({
      filter: `organization_id:${idEmpresa} pipeline_id:${idFunil}`,
      sort: "-updated_at",
      "page[number]": "1",
      "page[size]": "2",
    });

    const resposta = await this.executar<NegociacaoRd[]>(
      `/deals?${parametros.toString()}`,
    );
    return resposta.data ?? [];
  }

  async obterNegociacao(idNegociacao: string) {
    const resposta = await this.executar<NegociacaoRd>(
      `/deals/${encodeURIComponent(idNegociacao)}`,
    );
    return resposta.data;
  }

  async aguardarResponsavelNegociacao(
    idNegociacao: string,
    tentativas = 12,
    intervaloMs = 500,
  ) {
    for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
      const negociacao = await this.obterNegociacao(idNegociacao);
      const idResponsavel = String(negociacao.owner_id || "").trim();
      if (idResponsavel) return idResponsavel;

      if (tentativa < tentativas - 1) {
        await new Promise((resolver) => setTimeout(resolver, intervaloMs));
      }
    }

    throw new Error(
      "O RD criou a primeira negociação, mas não informou o responsável distribuído.",
    );
  }

  async criarContato(dados: {
    nome: string;
    telefone: string;
    email?: string;
    idEmpresa: string;
  }) {
    const resposta = await this.executar<ContatoRd>("/contacts", {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: dados.nome,
          organization_id: dados.idEmpresa,
          phones: [{ phone: dados.telefone, type: "mobile" }],
          ...(dados.email ? { emails: [{ email: dados.email }] } : {}),
        },
      }),
    });
    return resposta.data;
  }

  async obterUsuariosEquipe(idEquipe: string) {
    const respostaEquipe = await this.executar<EquipeRd>(
      `/teams/${encodeURIComponent(idEquipe)}`,
    );
    const idsUsuarios = respostaEquipe.data?.user_ids ?? [];

    const usuarios = await Promise.all(
      idsUsuarios.map(async (idUsuario) => {
        const resposta = await this.executar<UsuarioRd>(
          `/users/${encodeURIComponent(idUsuario)}`,
        );
        return resposta.data;
      }),
    );

    return usuarios
      .filter((usuario) => usuario?.id && usuario?.name)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  async criarNegociacao(dados: {
    nome: string;
    idEmpresa: string;
    idContato: string;
    idEtapa: string;
    idTime?: string;
    idResponsavel?: string;
    idCampanha?: string;
    camposPersonalizados: Record<string, string | number>;
  }) {
    const resposta = await this.executar<NegociacaoRd>("/deals", {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: dados.nome,
          status: "ongoing",
          stage_id: dados.idEtapa,
          campaign_id: dados.idCampanha ?? ID_CAMPANHA_INDICACOES,
          organization_id: dados.idEmpresa,
          contact_ids: [dados.idContato],
          ...(dados.idResponsavel ? { owner_id: dados.idResponsavel } : {}),
          custom_fields: dados.camposPersonalizados,
          ...(dados.idTime && !dados.idResponsavel
            ? {
                distribution_settings: {
                  stage_id: dados.idEtapa,
                  rule: {
                    type: "team",
                    id: dados.idTime,
                  },
                },
              }
            : {}),
        },
      }),
    });
    return resposta.data;
  }

  async atualizarCamposNegociacao(
    idNegociacao: string,
    camposPersonalizados: Record<string, string | number>,
  ) {
    const resposta = await this.executar<NegociacaoRd>(
      `/deals/${encodeURIComponent(idNegociacao)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          data: {
            custom_fields: camposPersonalizados,
          },
        }),
      },
    );
    return resposta.data;
  }

  async retomarNegociacaoParaAgendamento(dados: {
    idNegociacao: string;
    idResponsavel: string;
    idEtapa: string;
    idCampanha: string;
    idsContatos: string[];
    camposPersonalizados: Record<string, string | number>;
    reativar: boolean;
  }) {
    const resposta = await this.executar<NegociacaoRd>(
      `/deals/${encodeURIComponent(dados.idNegociacao)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          data: {
            ...(dados.reativar ? { status: "ongoing" } : {}),
            owner_id: dados.idResponsavel,
            stage_id: dados.idEtapa,
            campaign_id: dados.idCampanha,
            contact_ids: dados.idsContatos,
            ...(Object.keys(dados.camposPersonalizados).length > 0
              ? { custom_fields: dados.camposPersonalizados }
              : {}),
          },
        }),
      },
    );
    return resposta.data;
  }

  async criarAnotacaoNegociacao(idNegociacao: string, descricao: string) {
    const resposta = await this.executar<AnotacaoRd>(
      `/deals/${encodeURIComponent(idNegociacao)}/notes`,
      {
        method: "POST",
        body: JSON.stringify({
          data: {
            description: descricao,
          },
        }),
      },
    );
    return resposta.data;
  }

  async criarTarefaReuniao(dados: {
    idNegociacao: string;
    nome: string;
    descricao?: string;
    dataHoraIso: string;
    idCriador: string;
    idsResponsaveis?: string[];
  }) {
    const resposta = await this.executar<TarefaRd>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: dados.nome,
          ...(dados.descricao ? { description: dados.descricao } : {}),
          type: "meeting",
          status: "open",
          due_date: dados.dataHoraIso,
          deal_id: dados.idNegociacao,
          created_by_id: dados.idCriador,
          ...(dados.idsResponsaveis?.length
            ? { owner_ids: dados.idsResponsaveis }
            : {}),
        },
      }),
    });
    return resposta.data;
  }

  async excluirContato(idContato: string) {
    await this.executar<null>(`/contacts/${encodeURIComponent(idContato)}`, {
      method: "DELETE",
    });
  }
}
