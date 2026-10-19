import { NextResponse } from "next/server";
import {
  atualizarIndicacao,
  registrarIndicacoesRecebidas,
  type AtualizacaoIndicacaoSst,
  type NovaIndicacaoSst,
} from "../../../lib/indicacoes-sst";
import { ClienteRdV2, ErroRdV2 } from "../../../lib/rd-station-v2";
import {
  documentoClienteValido,
  formatarDocumentoCliente,
  normalizarDocumentoCliente,
  tipoDocumentoClienteValido,
  type TipoDocumentoCliente,
} from "../../../lib/validacao-documento-cliente";
import { garantirOpcaoCampoConsultor } from "../../../lib/rd-station-campos-v1";

const ID_CAMPO_PARCEIRO_EMPRESA =
  process.env.RD_CAMPO_PARCEIRO_EMPRESA?.trim() || "";
const ID_CAMPO_CONSULTOR_NEGOCIACAO =
  process.env.RD_CAMPO_CONSULTOR_NEGOCIACAO?.trim() || "";
const ID_CAMPO_CNPJ_CLIENTE_NEGOCIACAO =
  process.env.RD_CAMPO_DOCUMENTO_CLIENTE?.trim() || "";
const ID_ETAPA_NEGOCIACAO = process.env.RD_ETAPA_INDICACAO?.trim() || "";
const ID_TIME_NEGOCIACAO = process.env.RD_EQUIPE_INDICACAO?.trim() || "";
const LIMITE_EMPRESAS = 10;
const URL_BASE_NEGOCIACAO_RD = "https://crm.rdstation.com/app#/deals";

type EmpresaIndicadaEntrada = {
  nome_cliente?: unknown;
  tipo_documento_cliente?: unknown;
  cnpj_cliente?: unknown;
  quantidade_funcionarios?: unknown;
  cargos?: unknown;
};

type DadosIndicacao = EmpresaIndicadaEntrada & {
  id_parceiro?: unknown;
  nome_parceiro?: unknown;
  operacao?: unknown;
  consultora?: unknown;
  nome_contato?: unknown;
  telefone_contato?: unknown;
  email_contato?: unknown;
  observacao?: unknown;
  empresas?: unknown;
};

type EmpresaIndicada = {
  indice: number;
  nomeCliente: string;
  tipoDocumentoCliente: TipoDocumentoCliente | null;
  documentoCliente: string;
  quantidadeFuncionarios: string;
  cargos: string;
};

type ResultadoEmpresa = {
  indice_empresa: number;
  indicacao_id: number;
  nome_cliente: string;
  negociacao_id?: string;
  status: "sucesso" | "erro";
  mensagem: string;
};

type NegociacaoCriadaGrupo = {
  empresa: EmpresaIndicada;
  idIndicacao: number;
  idNegociacao: string;
};

function texto(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

function idParceiroValido(valor: string) {
  return /^[a-zA-Z0-9._\/-]{1,100}$/.test(valor);
}

function obterBancoPeloId(idParceiro: string) {
  const correspondencia = idParceiro.match(/^(.*)_([DQ])$/i);
  if (!correspondencia?.[1] || !correspondencia[2]) return null;

  const idParceiroBase = correspondencia[1];
  const siglaBanco = correspondencia[2].toUpperCase() as "D" | "Q";

  return {
    idParceiroBase,
    idParceiroCompleto: `${idParceiroBase}_${siglaBanco}`,
    siglaBanco,
    operacao:
      siglaBanco === "D" ? ("Operação D" as const) : ("Operação Q" as const),
  };
}

function normalizarEmpresas(entrada: DadosIndicacao): EmpresaIndicada[] {
  const recebidas = Array.isArray(entrada.empresas)
    ? entrada.empresas
    : [
        {
          nome_cliente: entrada.nome_cliente,
          tipo_documento_cliente: entrada.tipo_documento_cliente,
          cnpj_cliente: entrada.cnpj_cliente,
          quantidade_funcionarios: entrada.quantidade_funcionarios,
          cargos: entrada.cargos,
        },
      ];

  return recebidas.map((valor, indice) => {
    const empresa =
      valor && typeof valor === "object"
        ? (valor as EmpresaIndicadaEntrada)
        : ({} as EmpresaIndicadaEntrada);
    const tipoInformado =
      texto(empresa.tipo_documento_cliente).toUpperCase() || "CNPJ";
    const tipoDocumentoCliente = tipoDocumentoClienteValido(tipoInformado)
      ? tipoInformado
      : null;

    return {
      indice,
      nomeCliente: texto(empresa.nome_cliente),
      tipoDocumentoCliente,
      documentoCliente: tipoDocumentoCliente
        ? normalizarDocumentoCliente(
            texto(empresa.cnpj_cliente),
            tipoDocumentoCliente,
          )
        : "",
      quantidadeFuncionarios: texto(empresa.quantidade_funcionarios),
      cargos: texto(empresa.cargos),
    };
  });
}

function validarEmpresas(empresas: EmpresaIndicada[]) {
  if (empresas.length === 0) return "Informe pelo menos uma empresa.";
  if (empresas.length > LIMITE_EMPRESAS) {
    return `É permitido cadastrar no máximo ${LIMITE_EMPRESAS} empresas por indicação.`;
  }

  const documentos = new Set<string>();
  for (const empresa of empresas) {
    const numero = empresa.indice + 1;
    if (empresa.nomeCliente.length < 2) {
      return `O nome da empresa ${numero} deve ter pelo menos 2 caracteres.`;
    }
    if (
      !empresa.tipoDocumentoCliente ||
      !documentoClienteValido(
        empresa.documentoCliente,
        empresa.tipoDocumentoCliente,
      )
    ) {
      if (empresa.tipoDocumentoCliente === "CPF") {
        return `Informe um CPF válido para a empresa ${numero}.`;
      }
      return empresa.tipoDocumentoCliente === "CAEPF"
        ? `Informe um CAEPF válido para a empresa ${numero}.`
        : `Informe um CNPJ válido para a empresa ${numero}.`;
    }
    if (documentos.has(empresa.documentoCliente)) {
      return `O documento da empresa ${numero} já foi informado nesta indicação.`;
    }
    documentos.add(empresa.documentoCliente);

    if (
      empresa.quantidadeFuncionarios &&
      !/^\d{1,9}$/.test(empresa.quantidadeFuncionarios)
    ) {
      return `A quantidade de colaboradores da empresa ${numero} deve ser um número inteiro.`;
    }
    if (empresa.cargos && !/^\d{1,9}$/.test(empresa.cargos)) {
      return `O campo de cargos da empresa ${numero} deve ser um número inteiro.`;
    }
  }

  return null;
}

function montarResumoEmpresasGrupo(negociacoes: NegociacaoCriadaGrupo[]) {
  if (negociacoes.length <= 1) return "";

  const empresas = negociacoes.map(({ empresa, idNegociacao }, indice) =>
    [
      `Empresa ${indice + 1}`,
      `Nome da empresa: ${empresa.nomeCliente}`,
      `Documento da empresa: ${formatarDocumentoCliente(
        empresa.documentoCliente,
        empresa.tipoDocumentoCliente!,
      )}`,
      empresa.quantidadeFuncionarios
        ? `Quantidade de colaboradores: ${empresa.quantidadeFuncionarios}`
        : "",
      empresa.cargos ? `Cargos: ${empresa.cargos}` : "",
      `Link da negociação dessa empresa: ${URL_BASE_NEGOCIACAO_RD}/${encodeURIComponent(idNegociacao)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return ["Empresas do mesmo grupo:", ...empresas].join("\n\n");
}

function montarAnotacao(
  empresa: EmpresaIndicada,
  observacaoGeral: string,
  resumoEmpresasGrupo: string,
) {
  const informacoesEmpresa = [
    empresa.quantidadeFuncionarios
      ? `Quantidade de colaboradores: ${empresa.quantidadeFuncionarios}`
      : "",
    empresa.cargos ? `Cargos: ${empresa.cargos}` : "",
    observacaoGeral ? `Observações: ${observacaoGeral}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [informacoesEmpresa, resumoEmpresasGrupo].filter(Boolean).join("\n\n");
}

async function atualizarIndicacaoSemInterromper(
  idIndicacao: number,
  atualizacao: AtualizacaoIndicacaoSst,
) {
  try {
    await atualizarIndicacao(idIndicacao, atualizacao);
  } catch {
    console.error("Não foi possível atualizar o histórico da indicação.", {
      indicacao_id: idIndicacao,
      status: atualizacao.status,
    });
  }
}

async function atualizarLoteSemInterromper(
  idsIndicacoes: number[],
  atualizacao: AtualizacaoIndicacaoSst,
) {
  await Promise.all(
    idsIndicacoes.map((id) =>
      atualizarIndicacaoSemInterromper(id, atualizacao),
    ),
  );
}

export async function POST(requisicao: Request) {
  let entrada: DadosIndicacao;

  try {
    entrada = (await requisicao.json()) as DadosIndicacao;
  } catch {
    return NextResponse.json(
      { mensagem: "Os dados enviados estão em um formato inválido." },
      { status: 400 },
    );
  }

  const idParceiro = texto(entrada.id_parceiro);
  const nomeParceiro = texto(entrada.nome_parceiro).replace(/\$/g, "/");
  const nomeContato = texto(entrada.nome_contato);
  const telefoneContato = texto(entrada.telefone_contato).replace(/\D/g, "");
  const emailContato = texto(entrada.email_contato);
  const consultor = texto(entrada.consultora);
  const observacaoGeral = texto(entrada.observacao);
  const empresasIndicadas = normalizarEmpresas(entrada);

  if (!idParceiro || !nomeParceiro || !nomeContato || !consultor) {
    return NextResponse.json(
      { mensagem: "Preencha todos os campos obrigatórios antes de enviar." },
      { status: 400 },
    );
  }

  if (nomeContato.length < 2) {
    return NextResponse.json(
      { mensagem: "O nome do contato deve ter pelo menos 2 caracteres." },
      { status: 400 },
    );
  }

  if (![10, 11].includes(telefoneContato.length)) {
    return NextResponse.json(
      { mensagem: "Informe um telefone fixo ou celular válido com DDD." },
      { status: 400 },
    );
  }

  if (observacaoGeral.length > 5000) {
    return NextResponse.json(
      { mensagem: "A observação geral deve ter no máximo 5.000 caracteres." },
      { status: 400 },
    );
  }

  if (!idParceiroValido(idParceiro)) {
    return NextResponse.json(
      { mensagem: "O ID do parceiro informado no link possui formato inválido." },
      { status: 400 },
    );
  }

  const bancoParceiro = obterBancoPeloId(idParceiro);
  if (!bancoParceiro) {
    return NextResponse.json(
      {
        mensagem:
          "O ID do parceiro deve terminar com _D ou _Q.",
      },
      { status: 400 },
    );
  }

  const erroEmpresas = validarEmpresas(empresasIndicadas);
  if (erroEmpresas) {
    return NextResponse.json({ mensagem: erroEmpresas }, { status: 400 });
  }

  const indicacoes: NovaIndicacaoSst[] = empresasIndicadas.map((empresa) => ({
    idParceiro: bancoParceiro.idParceiroCompleto,
    idParceiroBase: bancoParceiro.idParceiroBase,
    siglaBanco: bancoParceiro.siglaBanco,
    nomeParceiro,
    operacao: bancoParceiro.operacao,
    discriminator: "B2C",
    consultora: consultor,
    nomeCliente: empresa.nomeCliente,
    cnpjCliente: empresa.documentoCliente,
    nomeContato,
    telefoneContato,
    emailContato: emailContato || undefined,
    quantidadeFuncionarios: empresa.quantidadeFuncionarios || undefined,
    cargos: empresa.cargos || undefined,
    observacao: observacaoGeral || undefined,
  }));

  let idsIndicacoes: number[];
  try {
    idsIndicacoes = await registrarIndicacoesRecebidas(indicacoes);
  } catch (erro) {
    const detalheErro =
      erro instanceof Error ? erro.message : "Erro desconhecido no banco.";
    const hostname = new URL(requisicao.url).hostname;
    const ambienteLocal = hostname === "127.0.0.1" || hostname === "localhost";

    console.error("Não foi possível registrar o lote de indicações no banco.", {
      detalhe: detalheErro,
      quantidade_empresas: empresasIndicadas.length,
    });
    return NextResponse.json(
      {
        mensagem: ambienteLocal
          ? `Não foi possível registrar a indicação: ${detalheErro}`
          : "Não foi possível registrar a indicação neste momento. Nenhuma negociação foi criada.",
      },
      { status: 500 },
    );
  }

  let contatoCriado: { id: string } | null = null;
  let quantidadeNegociacoesCriadas = 0;
  const idsFinalizados = new Set<number>();
  const resultados: ResultadoEmpresa[] = [];

  try {
    const rd = await ClienteRdV2.criar();
    const [slugParceiro, slugConsultor, slugCnpjCliente] = await Promise.all([
      rd.obterSlugCampo(ID_CAMPO_PARCEIRO_EMPRESA, "organization"),
      rd.obterSlugCampo(ID_CAMPO_CONSULTOR_NEGOCIACAO, "deal"),
      rd.obterSlugCampo(ID_CAMPO_CNPJ_CLIENTE_NEGOCIACAO, "deal"),
    ]);

    const empresasParceiras = await rd.buscarEmpresasPorCampo(
      slugParceiro,
      bancoParceiro.idParceiroCompleto,
    );

    if (empresasParceiras.length !== 1) {
      const mensagem =
        empresasParceiras.length === 0
          ? "Parceiro não localizado no RD Station. Confira o ID do parceiro informado no link. Nenhuma negociação foi criada."
          : "Mais de uma empresa foi encontrada com este ID de parceiro. Nenhuma negociação foi criada.";
      await atualizarLoteSemInterromper(idsIndicacoes, {
        status: "erro",
        mensagem,
      });
      return NextResponse.json(
        { mensagem, indicacao_ids: idsIndicacoes },
        { status: empresasParceiras.length === 0 ? 404 : 409 },
      );
    }

    const empresaParceira = await rd.garantirSegmentoEcossistema(
      empresasParceiras[0],
    );
    await atualizarLoteSemInterromper(idsIndicacoes, {
      status: "processando",
      mensagem: "Parceiro localizado no RD Station.",
      empresaRdId: empresaParceira.id,
    });

    contatoCriado = await rd.criarContato({
      nome: nomeContato,
      telefone: telefoneContato,
      email: emailContato || undefined,
      idEmpresa: empresaParceira.id,
    });
    await atualizarLoteSemInterromper(idsIndicacoes, {
      status: "processando",
      mensagem: "Contato principal criado e negociações aguardando criação.",
      empresaRdId: empresaParceira.id,
      contatoRdId: contatoCriado.id,
    });

    const opcaoConsultor = await garantirOpcaoCampoConsultor(
      ID_CAMPO_CONSULTOR_NEGOCIACAO,
      consultor,
    );
    let idResponsavelLote: string | null = null;
    let distribuicaoIndefinida = false;
    const negociacoesCriadasGrupo: NegociacaoCriadaGrupo[] = [];

    for (const empresa of empresasIndicadas) {
      const idIndicacao = idsIndicacoes[empresa.indice];
      let idNegociacaoCriada: string | undefined;

      try {
        const camposPersonalizados: Record<string, string> = {
          [slugConsultor]: opcaoConsultor.valorOpcao,
          [slugCnpjCliente]: formatarDocumentoCliente(
            empresa.documentoCliente,
            empresa.tipoDocumentoCliente!,
          ),
        };

        const negociacao = await rd.criarNegociacao({
          nome: empresa.nomeCliente,
          idEmpresa: empresaParceira.id,
          idContato: contatoCriado.id,
          idEtapa: ID_ETAPA_NEGOCIACAO,
          ...(idResponsavelLote
            ? { idResponsavel: idResponsavelLote }
            : { idTime: ID_TIME_NEGOCIACAO }),
          camposPersonalizados,
        });
        idNegociacaoCriada = negociacao.id;
        quantidadeNegociacoesCriadas += 1;

        await atualizarIndicacaoSemInterromper(idIndicacao, {
          status: "processando",
          mensagem: "Negociação criada e aguardando finalização.",
          empresaRdId: empresaParceira.id,
          contatoRdId: contatoCriado.id,
          negociacaoRdId: negociacao.id,
        });

        if (!idResponsavelLote) {
          idResponsavelLote =
            String(negociacao.owner_id || "").trim() ||
            (await rd.aguardarResponsavelNegociacao(negociacao.id));
        }

        negociacoesCriadasGrupo.push({
          empresa,
          idIndicacao,
          idNegociacao: negociacao.id,
        });
      } catch (erroEmpresa) {
        const mensagem =
          erroEmpresa instanceof Error
            ? erroEmpresa.message
            : "Não foi possível criar a negociação desta empresa.";
        await atualizarIndicacaoSemInterromper(idIndicacao, {
          status: "erro",
          mensagem,
          empresaRdId: empresaParceira.id,
          contatoRdId: contatoCriado.id,
          negociacaoRdId: idNegociacaoCriada,
        });
        idsFinalizados.add(idIndicacao);
        resultados.push({
          indice_empresa: empresa.indice,
          indicacao_id: idIndicacao,
          nome_cliente: empresa.nomeCliente,
          negociacao_id: idNegociacaoCriada,
          status: "erro",
          mensagem,
        });

        if (idNegociacaoCriada && !idResponsavelLote) {
          distribuicaoIndefinida = true;
          break;
        }
      }
    }

    if (distribuicaoIndefinida) {
      const idsPendentes = idsIndicacoes.filter((id) => !idsFinalizados.has(id));
      const mensagem =
        "O RD não confirmou o responsável da primeira negociação. As demais empresas não foram processadas para evitar responsáveis diferentes.";
      await atualizarLoteSemInterromper(idsPendentes, {
        status: "erro",
        mensagem,
        empresaRdId: empresaParceira.id,
        contatoRdId: contatoCriado.id,
      });
      for (const idPendente of idsPendentes) {
        const indice = idsIndicacoes.indexOf(idPendente);
        resultados.push({
          indice_empresa: indice,
          indicacao_id: idPendente,
          nome_cliente: empresasIndicadas[indice].nomeCliente,
          status: "erro",
          mensagem,
        });
        idsFinalizados.add(idPendente);
      }
    }

    const resumoEmpresasGrupo = montarResumoEmpresasGrupo(
      negociacoesCriadasGrupo,
    );

    for (const registro of negociacoesCriadasGrupo) {
      const { empresa, idIndicacao, idNegociacao } = registro;

      try {
        const anotacao = montarAnotacao(
          empresa,
          observacaoGeral,
          resumoEmpresasGrupo,
        );
        if (anotacao) {
          await rd.criarAnotacaoNegociacao(idNegociacao, anotacao);
        }

        const mensagem =
          "Negociação criada com o contato principal e o responsável do grupo.";
        await atualizarIndicacaoSemInterromper(idIndicacao, {
          status: "sucesso",
          mensagem,
          empresaRdId: empresaParceira.id,
          contatoRdId: contatoCriado.id,
          negociacaoRdId: idNegociacao,
        });
        idsFinalizados.add(idIndicacao);
        resultados.push({
          indice_empresa: empresa.indice,
          indicacao_id: idIndicacao,
          nome_cliente: empresa.nomeCliente,
          negociacao_id: idNegociacao,
          status: "sucesso",
          mensagem,
        });
      } catch (erroAnotacao) {
        const mensagem =
          erroAnotacao instanceof Error
            ? erroAnotacao.message
            : "A negociação foi criada, mas não foi possível registrar sua anotação.";
        await atualizarIndicacaoSemInterromper(idIndicacao, {
          status: "erro",
          mensagem,
          empresaRdId: empresaParceira.id,
          contatoRdId: contatoCriado.id,
          negociacaoRdId: idNegociacao,
        });
        idsFinalizados.add(idIndicacao);
        resultados.push({
          indice_empresa: empresa.indice,
          indicacao_id: idIndicacao,
          nome_cliente: empresa.nomeCliente,
          negociacao_id: idNegociacao,
          status: "erro",
          mensagem,
        });
      }
    }

    const sucessos = resultados.filter((item) => item.status === "sucesso");
    const erros = resultados.filter((item) => item.status === "erro");

    if (sucessos.length === 0) {
      if (quantidadeNegociacoesCriadas === 0) {
        await rd.excluirContato(contatoCriado.id).catch(() => undefined);
      }
      return NextResponse.json(
        {
          mensagem:
            erros[0]?.mensagem ||
            "Não foi possível criar as negociações no RD Station.",
          indicacao_ids: idsIndicacoes,
          resultados,
        },
        { status: 502 },
      );
    }

    const mensagem =
      erros.length === 0
        ? `${sucessos.length} negociação(ões) criada(s) com o mesmo contato e responsável.`
        : `${sucessos.length} negociação(ões) criada(s), mas ${erros.length} empresa(s) apresentou(aram) erro.`;

    return NextResponse.json(
      {
        mensagem,
        indicacao_id: idsIndicacoes[0],
        indicacao_ids: idsIndicacoes,
        negociacao_id: sucessos[0].negociacao_id,
        negociacao_ids: sucessos
          .map((item) => item.negociacao_id)
          .filter(Boolean),
        responsavel_id: idResponsavelLote,
        contato_id: contatoCriado.id,
        resultados: resultados.sort(
          (a, b) => a.indice_empresa - b.indice_empresa,
        ),
      },
      { status: erros.length === 0 ? 201 : 207 },
    );
  } catch (erro) {
    const statusRd = erro instanceof ErroRdV2 ? erro.status : null;
    console.error("Erro ao processar indicação em grupo no RD Station V2.", {
      status: statusRd,
      contato_criado: Boolean(contatoCriado),
      negociacoes_criadas: quantidadeNegociacoesCriadas,
    });

    const idsPendentes = idsIndicacoes.filter((id) => !idsFinalizados.has(id));
    const mensagem =
      quantidadeNegociacoesCriadas > 0
        ? "O processamento foi interrompido após a criação parcial das negociações. Consulte o responsável pela integração."
        : "Não foi possível consultar o RD Station neste momento. Nenhuma negociação foi criada.";
    await atualizarLoteSemInterromper(idsPendentes, {
      status: "erro",
      mensagem,
      contatoRdId: contatoCriado?.id,
    });

    if (contatoCriado && quantidadeNegociacoesCriadas === 0) {
      const rd = await ClienteRdV2.criar().catch(() => null);
      await rd?.excluirContato(contatoCriado.id).catch(() => undefined);
    }

    return NextResponse.json(
      {
        mensagem,
        indicacao_ids: idsIndicacoes,
        resultados,
      },
      { status: 502 },
    );
  }
}
