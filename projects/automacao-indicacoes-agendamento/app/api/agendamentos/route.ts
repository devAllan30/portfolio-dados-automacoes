import { NextResponse } from "next/server";
import {
  atualizarIndicacao,
  contarAgendamentosB2BPorResponsavel,
  registrarIndicacaoRecebida,
  type AtualizacaoIndicacaoSst,
} from "../../../lib/indicacoes-sst";
import { garantirOpcaoCampoConsultor } from "../../../lib/rd-station-campos-v1";
import {
  ClienteRdV2,
  ErroRdV2,
  type EmpresaRd,
} from "../../../lib/rd-station-v2";
import { formatarDocumentoParceiro } from "../../../lib/documento-parceiro";
import {
  ANTECEDENCIA_MINIMA_MINUTOS,
  consultarDisponibilidadeDia,
  criarEventoGoogle,
  ErroGoogleAgenda,
  excluirEventoGoogle,
  HORARIOS_AGENDA,
  usuariosRdComAgenda,
  type ReservaGoogle,
  type UsuarioAgenda,
} from "../../../lib/google-calendar";

const ID_CAMPO_PARCEIRO_EMPRESA =
  process.env.RD_CAMPO_PARCEIRO_EMPRESA?.trim() || "";
const ID_CAMPO_CONSULTOR_NEGOCIACAO =
  process.env.RD_CAMPO_CONSULTOR_NEGOCIACAO?.trim() || "";
const ID_CAMPO_PRE_VENDEDOR_SSTB2B =
  process.env.RD_CAMPO_PRE_VENDEDOR_B2B?.trim() || "";
const OPCAO_PRE_VENDEDOR_ECOSSISTEMA =
  process.env.RD_OPCAO_PRE_VENDEDOR_B2B?.trim() || "";
const ID_CAMPO_QUANTIDADE_CLIENTES =
  process.env.RD_CAMPO_QUANTIDADE_CLIENTES?.trim() || "";
const ID_CAMPO_CURVA_PARCEIRO =
  process.env.RD_CAMPO_CURVA_PARCEIRO?.trim() || "";
const ID_CAMPO_SETOR_PARCEIRO =
  process.env.RD_CAMPO_SETOR_PARCEIRO?.trim() || "";
const ID_CAMPO_DOCUMENTO_PARCEIRO =
  process.env.RD_CAMPO_DOCUMENTO_PARCEIRO?.trim() || "";
const ID_FUNIL_AGENDAMENTO = process.env.RD_FUNIL_AGENDAMENTO?.trim() || "";
const ID_ETAPA_NOVO_LEAD = process.env.RD_ETAPA_AGENDAMENTO?.trim() || "";
const ID_EQUIPE_CLOSER_SST = process.env.RD_EQUIPE_CLOSER?.trim() || "";
const ID_CAMPANHA_AGENDAMENTO =
  process.env.RD_CAMPANHA_AGENDAMENTO?.trim() || "";
const ASSUNTO_REUNIAO = "Reunião Sst";
const EMAIL_BOT_TRANSCRICAO = "meetbot@meetgeek.ai";
const MOTIVO_EMPRESA_MESMO_NOME =
  "Já existe uma empresa com esse nome cadastrada no RD Station CRM.";
const MOTIVO_EMPRESA_MESMO_DOCUMENTO =
  "Já existe uma empresa com esse documento cadastrada no RD Station CRM.";
const HORARIOS_DISPONIVEIS = new Set(HORARIOS_AGENDA);

type DadosAgendamento = {
  id_parceiro?: unknown;
  nome_parceiro?: unknown;
  operacao?: unknown;
  consultora?: unknown;
  curva?: unknown;
  setor?: unknown;
  documento_parceiro?: unknown;
  nome_empresa?: unknown;
  nome_contato?: unknown;
  telefone_contato?: unknown;
  email_contato?: unknown;
  emails_secundarios?: unknown;
  quantidade_clientes?: unknown;
  data_reuniao?: unknown;
  horario_reuniao?: unknown;
  observacao?: unknown;
};

class ErroHorarioIndisponivel extends Error {}

let filaReservaGoogle: Promise<void> = Promise.resolve();

async function executarReservaEmSerie<T>(acao: () => Promise<T>) {
  const anterior = filaReservaGoogle;
  let liberar!: () => void;
  const atual = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  filaReservaGoogle = anterior.then(() => atual);
  await anterior;
  try {
    return await acao();
  } finally {
    liberar();
  }
}

function texto(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

function listaTextos(valor: unknown) {
  return Array.isArray(valor)
    ? valor
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function emailValido(valor: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function operacaoRdAmigavel(caminho: string) {
  if (caminho === "/organizations") return "cadastro da empresa";
  if (caminho.startsWith("/organizations/")) return "atualização da empresa";
  if (caminho === "/contacts") return "cadastro do contato";
  if (caminho.startsWith("/contacts/")) return "atualização do contato";
  if (caminho === "/deals") return "cadastro da negociação";
  if (caminho.includes("/notes")) return "anotação da negociação";
  if (caminho.startsWith("/deals/")) return "atualização da negociação";
  if (caminho === "/tasks") return "agendamento da reunião";
  if (caminho.startsWith("/custom_fields/")) return "validação dos campos do RD";
  return "integração com o RD";
}

function normalizarTextoErro(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function identificarMotivosConflitoEmpresa(erro: ErroRdV2) {
  const conteudo = normalizarTextoErro(
    `${erro.detalhes} ${JSON.stringify(erro.errosOriginais)}`,
  );
  const erroDeNome = /\b(nome|name|razao social|corporate name)\b/.test(conteudo);
  const erroDeDocumento = /\b(cpf|cnpj|documento|document)\b/.test(conteudo);

  return [
    ...(erroDeNome ? [MOTIVO_EMPRESA_MESMO_NOME] : []),
    ...(erroDeDocumento ? [MOTIVO_EMPRESA_MESMO_DOCUMENTO] : []),
  ];
}

function mensagemErroRdParaUsuario(dados: {
  erro: ErroRdV2;
  criacaoEmpresaSemIdParceiro: boolean;
}) {
  const detalhe = dados.erro.detalhes || "O RD não informou detalhes adicionais.";

  if (dados.criacaoEmpresaSemIdParceiro) {
    return "Não foi possível cadastrar a empresa no RD Station CRM e concluir o agendamento.";
  }

  return `Não foi possível concluir o agendamento durante ${operacaoRdAmigavel(
    dados.erro.caminho,
  )}. Motivo informado pelo RD: ${detalhe}`;
}

function idParceiroValido(valor: string) {
  return /^[a-zA-Z0-9._\/-]{1,100}_[DQ]$/i.test(valor);
}

async function atualizarIndicacaoSemInterromper(
  idIndicacao: number,
  atualizacao: AtualizacaoIndicacaoSst,
) {
  try {
    await atualizarIndicacao(idIndicacao, atualizacao);
  } catch {
    console.error("Não foi possível atualizar o histórico do agendamento.", {
      indicacao_id: idIndicacao,
      status: atualizacao.status,
    });
  }
}

async function cancelarEventoGoogleSemInterromper(
  reserva: ReservaGoogle | null,
) {
  if (!reserva) return;
  try {
    await excluirEventoGoogle(reserva);
  } catch (erro) {
    console.error("Não foi possível remover um evento do Google Agenda.", {
      evento_google_id: reserva.id,
      codigo: erro instanceof ErroGoogleAgenda ? erro.codigo : null,
    });
  }
}

function dataHoraDaReuniao(data: string, horario: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(horario)) {
    return null;
  }

  const dataHora = new Date(`${data}T${horario}:00-03:00`);
  if (Number.isNaN(dataHora.getTime())) return null;
  return dataHora;
}

function dataHoraComFusoRd(data: string, horario: string) {
  return `${data}T${horario}:00.000-03:00`;
}

function escolherResponsavelEquilibrado(
  responsaveis: UsuarioAgenda[],
  contagens: Map<string, number>,
) {
  const menorQuantidade = Math.min(
    ...responsaveis.map((responsavel) => contagens.get(responsavel.id) ?? 0),
  );
  const empatados = responsaveis.filter(
    (responsavel) =>
      (contagens.get(responsavel.id) ?? 0) === menorQuantidade,
  );
  return empatados[Math.floor(Math.random() * empatados.length)];
}

function montarDescricaoTarefa(dados: {
  nomeEmpresa: string;
  nomeContato: string;
  telefoneContato: string;
  emailContato: string;
  consultor: string;
  nomeParceiro: string;
  idParceiro: string;
}) {
  return [
    `Empresa e negociação: ${dados.nomeEmpresa}`,
    `Contato: ${dados.nomeContato}`,
    `Telefone: ${dados.telefoneContato}`,
    dados.emailContato ? `E-mail: ${dados.emailContato}` : "",
    `Parceiro: ${dados.nomeParceiro} (${dados.idParceiro})`,
    `Consultor(a): ${dados.consultor}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function montarDescricaoEventoGoogle(dados: {
  nomeEmpresa: string;
  nomeContato: string;
  telefoneContato: string;
  emailContato: string;
  consultor: string;
}) {
  return [
    `Este parceiro: ${dados.nomeEmpresa}`,
    `Contato: ${dados.nomeContato}`,
    `Telefone: ${dados.telefoneContato}`,
    `E-mail: ${dados.emailContato}`,
    `Consultor(a): ${dados.consultor}`,
  ].join("\n");
}

function montarAnotacaoNegociacaoExistente(dados: {
  nomeEmpresa: string;
  nomeParceiro: string;
  idParceiro: string;
  operacao: string;
  consultor: string;
  curva: string;
  setor: string;
  documentoParceiro: string;
  nomeContato: string;
  telefoneContato: string;
  emailContato: string;
  quantidadeClientes: string;
  responsavel: string;
  dataReuniao: string;
  horarioReuniao: string;
  observacao: string;
}) {
  const [ano, mes, dia] = dados.dataReuniao.split("-");
  const dataFormatada =
    ano && mes && dia ? `${dia}/${mes}/${ano}` : dados.dataReuniao;

  return [
    "Agendamento B2B",
    `Nome da empresa informada: ${dados.nomeEmpresa}`,
    `Parceiro: ${dados.nomeParceiro} (${dados.idParceiro})`,
    `Operação: ${dados.operacao}`,
    `Consultor(a): ${dados.consultor}`,
    dados.curva ? `Curva: ${dados.curva}` : "",
    dados.setor ? `Setor: ${dados.setor}` : "",
    dados.documentoParceiro
      ? `CPF/CNPJ do parceiro: ${dados.documentoParceiro}`
      : "",
    `Nome do contato: ${dados.nomeContato}`,
    `Telefone do contato: ${dados.telefoneContato}`,
    dados.emailContato ? `E-mail do contato: ${dados.emailContato}` : "",
    dados.quantidadeClientes
      ? `Quantidade de clientes: ${dados.quantidadeClientes}`
      : "",
    `Responsável pela reunião: ${dados.responsavel}`,
    `Data da reunião: ${dataFormatada}`,
    `Horário da reunião: ${dados.horarioReuniao}`,
    dados.observacao ? `Observações: ${dados.observacao}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function GET(requisicao: Request) {
  const data = new URL(requisicao.url).searchParams.get("data")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json(
      { mensagem: "Informe uma data válida para consultar os horários." },
      { status: 400 },
    );
  }

  try {
    const rd = await ClienteRdV2.criar();
    const usuarios = await rd.obterUsuariosEquipe(ID_EQUIPE_CLOSER_SST);
    const usuariosAgenda = usuariosRdComAgenda(usuarios);
    const disponibilidade = await consultarDisponibilidadeDia(
      usuariosAgenda,
      data,
    );
    const agora = Date.now();
    const horarios = disponibilidade
      .filter(
        (item) =>
          item.responsaveis.length > 0 &&
          (dataHoraDaReuniao(data, item.horario)?.getTime() ?? 0) > agora,
      )
      .map((item) => item.horario);

    return NextResponse.json({
      horarios,
      duracao_minutos: 30,
      fuso_horario: "America/Sao_Paulo",
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (erro) {
    console.error("Erro ao consultar disponibilidade da equipe configurada.", {
      status: erro instanceof ErroRdV2 ? erro.status : null,
      codigo: erro instanceof ErroGoogleAgenda ? erro.codigo : null,
    });
    return NextResponse.json(
      { mensagem: "Não foi possível consultar os horários neste momento." },
      { status: 502 },
    );
  }
}

export async function POST(requisicao: Request) {
  let entrada: DadosAgendamento;

  try {
    entrada = (await requisicao.json()) as DadosAgendamento;
  } catch {
    return NextResponse.json(
      { mensagem: "Os dados enviados estão em um formato inválido." },
      { status: 400 },
    );
  }

  const idParceiro = texto(entrada.id_parceiro).toUpperCase();
  const nomeParceiro = texto(entrada.nome_parceiro).replace(/\$/g, "/");
  const consultor = texto(entrada.consultora);
  const curva = texto(entrada.curva);
  const setor = texto(entrada.setor);
  const documentoParceiroRecebido = texto(entrada.documento_parceiro);
  const nomeEmpresa = texto(entrada.nome_empresa);
  const nomeContato = texto(entrada.nome_contato);
  const telefoneContato = texto(entrada.telefone_contato).replace(/\D/g, "");
  const emailContato = texto(entrada.email_contato);
  const emailsSecundarios = listaTextos(entrada.emails_secundarios);
  const quantidadeClientesTexto = texto(entrada.quantidade_clientes);
  const dataReuniao = texto(entrada.data_reuniao);
  const horarioReuniao = texto(entrada.horario_reuniao);
  const observacao = texto(entrada.observacao);

  if (
    !idParceiro ||
    !nomeParceiro ||
    !consultor ||
    !documentoParceiroRecebido ||
    !nomeEmpresa ||
    !nomeContato ||
    !telefoneContato ||
    !emailContato ||
    !dataReuniao ||
    !horarioReuniao
  ) {
    return NextResponse.json(
      { mensagem: "Preencha todos os campos obrigatórios antes de enviar." },
      { status: 400 },
    );
  }

  if (!idParceiroValido(idParceiro)) {
    return NextResponse.json(
      { mensagem: "O ID do parceiro deve terminar com _D ou _Q." },
      { status: 400 },
    );
  }

  if (
    nomeParceiro.length < 2 ||
    nomeEmpresa.length < 2 ||
    nomeContato.length < 2
  ) {
    return NextResponse.json(
      {
        mensagem:
          "Os nomes da empresa, do parceiro e do contato devem ter ao menos 2 caracteres.",
      },
      { status: 400 },
    );
  }

  const documentoParceiro = formatarDocumentoParceiro(
    documentoParceiroRecebido,
  );
  if (!documentoParceiro) {
    return NextResponse.json(
      {
        mensagem:
          "O documento no link deve conter somente os 11 dígitos do CPF ou os 14 dígitos do CNPJ.",
      },
      { status: 400 },
    );
  }

  if (
    curva.length > 255 ||
    setor.length > 255 ||
    documentoParceiroRecebido.length > 255 ||
    nomeEmpresa.length > 255
  ) {
    return NextResponse.json(
      { mensagem: "Curva, setor ou documento informado no link é inválido." },
      { status: 400 },
    );
  }

  if (![10, 11].includes(telefoneContato.length)) {
    return NextResponse.json(
      { mensagem: "Informe um telefone fixo ou celular válido com DDD." },
      { status: 400 },
    );
  }

  if (!emailValido(emailContato)) {
    return NextResponse.json(
      { mensagem: "Informe um endereço de e-mail válido para o contato." },
      { status: 400 },
    );
  }

  if (emailsSecundarios.length > 10) {
    return NextResponse.json(
      { mensagem: "Informe no máximo 10 e-mails adicionais." },
      { status: 400 },
    );
  }

  if (emailsSecundarios.some((email) => !emailValido(email))) {
    return NextResponse.json(
      { mensagem: "Um dos e-mails adicionais informados é inválido." },
      { status: 400 },
    );
  }

  const emailsParticipantes = Array.from(
    new Set(
      [emailContato, ...emailsSecundarios, EMAIL_BOT_TRANSCRICAO].map((email) =>
        email.toLocaleLowerCase("pt-BR"),
      ),
    ),
  );

  if (
    quantidadeClientesTexto &&
    (!/^\d+$/.test(quantidadeClientesTexto) || Number(quantidadeClientesTexto) < 1)
  ) {
    return NextResponse.json(
      { mensagem: "A quantidade de clientes deve ser um número inteiro maior que zero." },
      { status: 400 },
    );
  }

  const quantidadeClientes = quantidadeClientesTexto
    ? Number(quantidadeClientesTexto)
    : null;

  if (observacao.length > 5000) {
    return NextResponse.json(
      { mensagem: "A observação deve ter no máximo 5.000 caracteres." },
      { status: 400 },
    );
  }

  const dataHora = dataHoraDaReuniao(dataReuniao, horarioReuniao);
  if (!dataHora) {
    return NextResponse.json(
      { mensagem: "Informe uma data e um horário válidos para a reunião." },
      { status: 400 },
    );
  }

  if (!HORARIOS_DISPONIVEIS.has(horarioReuniao)) {
    return NextResponse.json(
      { mensagem: "Selecione um dos horários disponíveis entre 08:00 e 18:00." },
      { status: 400 },
    );
  }

  if (
    dataHora.getTime() <
    Date.now() + ANTECEDENCIA_MINIMA_MINUTOS * 60_000
  ) {
    return NextResponse.json(
      {
        mensagem:
          "A reunião deve ser agendada com pelo menos 15 minutos de antecedência.",
      },
      { status: 400 },
    );
  }

  const dataHoraRd = dataHoraComFusoRd(dataReuniao, horarioReuniao);

  const siglaBanco = idParceiro.endsWith("_D") ? "D" : "Q";
  const idParceiroBase = idParceiro.slice(0, -2);
  const operacaoBanco = siglaBanco === "D" ? "Operação D" : "Operação Q";
  let idIndicacao = 0;
  let reservaGoogle: ReservaGoogle | null = null;
  let rd: ClienteRdV2;
  let responsavel: UsuarioAgenda;

  try {
    const reserva = await executarReservaEmSerie(async () => {
      const clienteRd = await ClienteRdV2.criar();
      const usuariosEquipe = await clienteRd.obterUsuariosEquipe(
        ID_EQUIPE_CLOSER_SST,
      );
      const usuariosAgenda = usuariosRdComAgenda(usuariosEquipe);
      const disponibilidade = await consultarDisponibilidadeDia(
        usuariosAgenda,
        dataReuniao,
      );
      const responsaveisDisponiveis =
        disponibilidade.find((item) => item.horario === horarioReuniao)
          ?.responsaveis ?? [];

      if (responsaveisDisponiveis.length === 0) {
        throw new ErroHorarioIndisponivel(
          "O horário selecionado acabou de ficar indisponível.",
        );
      }

      const contagens = await contarAgendamentosB2BPorResponsavel(
        responsaveisDisponiveis.map((usuario) => usuario.id),
        dataReuniao,
      );
      const responsavelEscolhido = escolherResponsavelEquilibrado(
        responsaveisDisponiveis,
        contagens,
      );
      const idIndicacaoCriado = await registrarIndicacaoRecebida({
        idParceiro,
        idParceiroBase,
        siglaBanco,
        nomeParceiro,
        operacao: operacaoBanco,
        discriminator: "B2B",
        consultora: consultor,
        nomeCliente: nomeEmpresa,
        cnpjCliente: documentoParceiro.replace(/\D/g, ""),
        nomeContato,
        telefoneContato,
        emailContato: emailContato || undefined,
        observacao: observacao || undefined,
        dataHoraReuniao: `${dataReuniao} ${horarioReuniao}:00`,
        responsavelReuniaoId: responsavelEscolhido.id,
      });

      try {
        const evento = await criarEventoGoogle({
          responsavel: responsavelEscolhido,
          data: dataReuniao,
          horario: horarioReuniao,
          nomeEmpresa,
          emailsParticipantes,
          descricao: montarDescricaoEventoGoogle({
            nomeEmpresa,
            nomeContato,
            telefoneContato,
            emailContato,
            consultor,
          }),
          idIndicacao: idIndicacaoCriado,
        });
        return {
          rd: clienteRd,
          responsavel: responsavelEscolhido,
          idIndicacao: idIndicacaoCriado,
          evento,
        };
      } catch (erro) {
        await atualizarIndicacaoSemInterromper(idIndicacaoCriado, {
          status: "erro",
          mensagem:
            "Não foi possível reservar o horário no Google Agenda. Nenhuma alteração foi enviada ao RD Station.",
        });
        throw erro;
      }
    });

    rd = reserva.rd;
    responsavel = reserva.responsavel;
    idIndicacao = reserva.idIndicacao;
    reservaGoogle = reserva.evento;
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : "Erro desconhecido.";
    const hostname = new URL(requisicao.url).hostname;
    const ambienteLocal = hostname === "127.0.0.1" || hostname === "localhost";

    console.error("Não foi possível reservar o agendamento.", {
      detalhe,
      codigo: erro instanceof ErroGoogleAgenda ? erro.codigo : null,
      detalhes_google:
        erro instanceof ErroGoogleAgenda ? erro.detalhes : undefined,
    });
    const horarioIndisponivel = erro instanceof ErroHorarioIndisponivel;
    return NextResponse.json(
      {
        mensagem: horarioIndisponivel
          ? "O horário selecionado não está mais disponível. Consulte novamente e escolha outro horário."
          : erro instanceof ErroGoogleAgenda
            ? "Não foi possível confirmar o horário no Google Agenda. Tente novamente em alguns instantes."
            : ambienteLocal
              ? `Não foi possível registrar o agendamento: ${detalhe}`
              : "Não foi possível registrar o agendamento neste momento.",
      },
      { status: horarioIndisponivel ? 409 : 502 },
    );
  }

  const idResponsavel = responsavel.id;

  let empresaCriada = false;
  let negociacaoCriada = false;
  let contatoCriado: { id: string } | null = null;
  let criacaoEmpresaSemIdParceiro = false;

  try {
    const [campoCurva, campoSetor, slugDocumentoParceiro] = await Promise.all([
      curva
        ? rd.obterOpcaoCampoNegociacao(ID_CAMPO_CURVA_PARCEIRO, curva)
        : Promise.resolve(null),
      setor
        ? rd.obterOpcaoCampoNegociacao(ID_CAMPO_SETOR_PARCEIRO, setor)
        : Promise.resolve(null),
      documentoParceiro
        ? rd.obterSlugCampo(ID_CAMPO_DOCUMENTO_PARCEIRO, "deal")
        : Promise.resolve(null),
    ]);
    const camposRecebidosNoLink: Record<string, string> = {
      ...(campoCurva ? { [campoCurva.slug]: campoCurva.valor } : {}),
      ...(campoSetor ? { [campoSetor.slug]: campoSetor.valor } : {}),
      ...(slugDocumentoParceiro
        ? { [slugDocumentoParceiro]: documentoParceiro }
        : {}),
    };

    const slugParceiro = await rd.obterSlugCampo(
      ID_CAMPO_PARCEIRO_EMPRESA,
      "organization",
    );
    const empresas = await rd.buscarEmpresasPorCampo(slugParceiro, idParceiro);

    if (empresas.length > 1) {
      await atualizarIndicacaoSemInterromper(idIndicacao, {
        status: "erro",
        mensagem: "Mais de uma empresa foi encontrada com este ID de parceiro.",
      });
      await cancelarEventoGoogleSemInterromper(reservaGoogle);
      return NextResponse.json(
        {
          mensagem:
            "Mais de uma empresa foi encontrada com este ID de parceiro. O agendamento não foi criado.",
        },
        { status: 409 },
      );
    }

    let empresa: EmpresaRd;
    if (empresas[0]) {
      empresa = await rd.garantirSegmentoEcossistema(empresas[0]);
    } else {
      criacaoEmpresaSemIdParceiro = true;
      empresa = await rd.criarEmpresa({
          nome: nomeEmpresa,
          slugCampoParceiro: slugParceiro,
          idParceiro,
          idResponsavel,
        });
      criacaoEmpresaSemIdParceiro = false;
    }
    empresaCriada = empresas.length === 0;

    const negociacoes = await rd.buscarNegociacoesEmpresaNoFunil(
      empresa.id,
      ID_FUNIL_AGENDAMENTO,
    );
    let negociacao = negociacoes[0];
    const negociacaoJaExistia = Boolean(negociacao);

    if (!negociacao) {
      contatoCriado = await rd.criarContato({
        nome: nomeContato,
        telefone: telefoneContato,
        email: emailContato || undefined,
        idEmpresa: empresa.id,
      });

      try {
        const [
          campoPreVendedor,
          slugConsultor,
          opcaoConsultor,
          slugQuantidadeClientes,
        ] =
          await Promise.all([
            rd.obterOpcaoCampoNegociacao(
              ID_CAMPO_PRE_VENDEDOR_SSTB2B,
              OPCAO_PRE_VENDEDOR_ECOSSISTEMA,
            ),
            rd.obterSlugCampo(ID_CAMPO_CONSULTOR_NEGOCIACAO, "deal"),
            garantirOpcaoCampoConsultor(
              ID_CAMPO_CONSULTOR_NEGOCIACAO,
              consultor,
            ),
            quantidadeClientes !== null
              ? rd.obterSlugCampo(ID_CAMPO_QUANTIDADE_CLIENTES, "deal")
              : Promise.resolve(null),
          ]);

        negociacao = await rd.criarNegociacao({
          nome: nomeEmpresa,
          idEmpresa: empresa.id,
          idContato: contatoCriado.id,
          idEtapa: ID_ETAPA_NOVO_LEAD,
          idResponsavel,
          idCampanha: ID_CAMPANHA_AGENDAMENTO,
          camposPersonalizados: {
            [campoPreVendedor.slug]: campoPreVendedor.valor,
            [slugConsultor]: opcaoConsultor.valorOpcao,
            ...camposRecebidosNoLink,
            ...(slugQuantidadeClientes && quantidadeClientes !== null
              ? { [slugQuantidadeClientes]: quantidadeClientes }
              : {}),
          },
        });
        negociacaoCriada = true;
      } catch (erroNegociacao) {
        await rd.excluirContato(contatoCriado.id).catch(() => undefined);
        throw erroNegociacao;
      }
    } else {
      contatoCriado = await rd.criarContato({
        nome: nomeContato,
        telefone: telefoneContato,
        email: emailContato || undefined,
        idEmpresa: empresa.id,
      });

      const camposParaAtualizar: Record<string, string | number> = {
        ...camposRecebidosNoLink,
      };

      const [campoPreVendedor, slugConsultor, opcaoConsultor] =
        await Promise.all([
          rd.obterOpcaoCampoNegociacao(
            ID_CAMPO_PRE_VENDEDOR_SSTB2B,
            OPCAO_PRE_VENDEDOR_ECOSSISTEMA,
          ),
          rd.obterSlugCampo(ID_CAMPO_CONSULTOR_NEGOCIACAO, "deal"),
          garantirOpcaoCampoConsultor(
            ID_CAMPO_CONSULTOR_NEGOCIACAO,
            consultor,
          ),
        ]);
      camposParaAtualizar[campoPreVendedor.slug] = campoPreVendedor.valor;
      camposParaAtualizar[slugConsultor] = opcaoConsultor.valorOpcao;

      if (quantidadeClientes !== null) {
        const slugQuantidadeClientes = await rd.obterSlugCampo(
          ID_CAMPO_QUANTIDADE_CLIENTES,
          "deal",
        );
        camposParaAtualizar[slugQuantidadeClientes] = quantidadeClientes;
      }

      try {
        const negociacaoCompleta = await rd.obterNegociacao(negociacao.id);
        const idsContatos = Array.from(
          new Set([
            ...(negociacaoCompleta.contact_ids ?? []),
            contatoCriado.id,
          ]),
        );

        negociacao = await rd.retomarNegociacaoParaAgendamento({
          idNegociacao: negociacao.id,
          idResponsavel,
          idEtapa: ID_ETAPA_NOVO_LEAD,
          idCampanha: ID_CAMPANHA_AGENDAMENTO,
          idsContatos,
          camposPersonalizados: camposParaAtualizar,
          reativar: negociacaoCompleta.status === "lost",
        });
      } catch (erroNegociacao) {
        await rd.excluirContato(contatoCriado.id).catch(() => undefined);
        contatoCriado = null;
        throw erroNegociacao;
      }
    }

    await atualizarIndicacaoSemInterromper(idIndicacao, {
      status: "processando",
      mensagem: "Negociação localizada e reunião aguardando agendamento.",
      empresaRdId: empresa.id,
      contatoRdId: contatoCriado?.id,
      negociacaoRdId: negociacao.id,
    });

    const anotacao = negociacaoJaExistia
      ? montarAnotacaoNegociacaoExistente({
          nomeEmpresa,
          nomeParceiro,
          idParceiro,
          operacao: operacaoBanco,
          consultor,
          curva,
          setor,
          documentoParceiro,
          nomeContato,
          telefoneContato,
          emailContato,
          quantidadeClientes: quantidadeClientesTexto,
          responsavel: responsavel.nome,
          dataReuniao,
          horarioReuniao,
          observacao,
        })
      : observacao
        ? `Observações: ${observacao}`
        : "";

    if (anotacao) {
      await rd.criarAnotacaoNegociacao(
        negociacao.id,
        anotacao,
      );
    }

    const tarefa = await rd.criarTarefaReuniao({
      idNegociacao: negociacao.id,
      nome: ASSUNTO_REUNIAO,
      descricao: montarDescricaoTarefa({
        nomeEmpresa,
        nomeContato,
        telefoneContato,
        emailContato,
        consultor,
        nomeParceiro,
        idParceiro,
      }),
      dataHoraIso: dataHoraRd,
      idCriador: idResponsavel,
      idsResponsaveis: [idResponsavel],
    });

    await atualizarIndicacaoSemInterromper(idIndicacao, {
      status: "sucesso",
      mensagem: "Reunião agendada no RD Station e no Google Agenda com sucesso.",
      empresaRdId: empresa.id,
      contatoRdId: contatoCriado?.id,
      negociacaoRdId: negociacao.id,
    });

    return NextResponse.json(
      {
        mensagem: negociacaoCriada
          ? "Negociação e reunião criadas com sucesso."
          : "Reunião agendada na negociação existente com sucesso.",
        empresa_criada: empresaCriada,
        negociacao_criada: negociacaoCriada,
        empresa_id: empresa.id,
        negociacao_id: negociacao.id,
        tarefa_id: tarefa.id,
        responsavel: responsavel.nome,
        data_reuniao: dataHoraRd,
        indicacao_id: idIndicacao,
        evento_google_id: reservaGoogle.id,
        evento_google_link: reservaGoogle.link,
        evento_google_meet_link: reservaGoogle.linkMeet,
      },
      { status: 201 },
    );
  } catch (erro) {
    await cancelarEventoGoogleSemInterromper(reservaGoogle);
    const statusRd = erro instanceof ErroRdV2 ? erro.status : null;
    const caminhoRd = erro instanceof ErroRdV2 ? erro.caminho : null;
    const detalhesRd = erro instanceof ErroRdV2 ? erro.detalhes : null;
    console.error("Erro ao criar agendamento no RD Station V2.", {
      status: statusRd,
      caminho: caminhoRd,
      detalhes: detalhesRd,
      empresa_criada: empresaCriada,
      negociacao_criada: negociacaoCriada,
      contato_criado: Boolean(contatoCriado),
    });

    const mensagemUsuario =
      erro instanceof ErroGoogleAgenda
        ? "Não foi possível concluir o agendamento no Google Agenda. Tente novamente."
        : erro instanceof ErroRdV2
        ? mensagemErroRdParaUsuario({
            erro,
            criacaoEmpresaSemIdParceiro,
          })
        : "Não foi possível concluir o agendamento por uma falha interna da integração. Tente novamente ou acione o responsável pela integração.";
    const motivosUsuario =
      erro instanceof ErroRdV2 && criacaoEmpresaSemIdParceiro
        ? identificarMotivosConflitoEmpresa(erro)
        : [];
    const mensagemUsuarioComDetalhe =
      erro instanceof ErroRdV2 &&
      criacaoEmpresaSemIdParceiro &&
      motivosUsuario.length === 0
        ? `${mensagemUsuario} Motivo informado pelo RD: ${erro.detalhes}`
        : mensagemUsuario;
    const mensagemHistorico = motivosUsuario.length
      ? `${mensagemUsuarioComDetalhe} ${motivosUsuario.join(" ")} Detalhe técnico do RD: ${erro instanceof ErroRdV2 ? erro.detalhes : "Não informado."}`
      : mensagemUsuarioComDetalhe;

    await atualizarIndicacaoSemInterromper(idIndicacao, {
      status: "erro",
      mensagem: mensagemHistorico,
      contatoRdId: contatoCriado?.id,
    });

    return NextResponse.json(
      {
        mensagem: mensagemUsuarioComDetalhe,
        ...(motivosUsuario.length > 0 ? { motivos: motivosUsuario } : {}),
        codigo:
          erro instanceof ErroRdV2 && criacaoEmpresaSemIdParceiro
            ? "EMPRESA_NAO_LOCALIZADA_POR_ID_E_CRIACAO_RECUSADA"
            : "ERRO_INTEGRACAO_RD",
      },
      {
        status:
          erro instanceof ErroRdV2 && criacaoEmpresaSemIdParceiro ? 409 : 502,
      },
    );
  }
}
