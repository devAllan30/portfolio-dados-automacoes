import { NextResponse } from "next/server";
import { atualizarAgendamento, contarAgendamentosPorResponsavel, registrarAgendamento } from "../../../../lib/agendamento-bdr-sst/agendamentos";
import { carregarContextoNegociacao, ErroContextoNegociacao } from "../../../../lib/agendamento-bdr-sst/contexto-negociacao";
import { dataEhFimDeSemana, dataHoraAgendamento, formatarDataHoraRd } from "../../../../lib/data-agendamento";
import { ANTECEDENCIA_MINIMA_MINUTOS, consultarDisponibilidadeDia, criarEventoGoogle, ErroGoogleAgenda, excluirEventoGoogle, HORARIOS_AGENDA, type ReservaGoogle, type UsuarioAgenda, usuariosRdComAgenda } from "../../../../lib/agendamento-bdr-sst/google-calendar";
import { ErroRdV2 } from "../../../../lib/agendamento-bdr-sst/rd-station-v2";
import { validarEmailsSelecionados } from "../../../../lib/agendamento-bdr-sst/validacao-emails";

const ID_EQUIPE = process.env.RD_EQUIPE_CLOSER?.trim() || "679294fc3e41190018178cb4";
const ID_ETAPA_AGENDADO = "678fab56b5999f0014422fec";
const ID_CAMPO_PRE_VENDEDOR = "6878fdd3149ecd001a92e2d1";
const EMAIL_BOT = process.env.GOOGLE_MEET_BOT_EMAIL?.trim() || "meetbot@meetgeek.ai";
const HORARIOS_VALIDOS = new Set(HORARIOS_AGENDA);
let filaReserva: Promise<void> = Promise.resolve();

async function emSerie<T>(acao: () => Promise<T>) {
  const anterior = filaReserva;
  let liberar!: () => void;
  filaReserva = anterior.then(() => new Promise<void>((resolver) => { liberar = resolver; }));
  await anterior;
  try { return await acao(); } finally { liberar(); }
}

function texto(valor: unknown) { return typeof valor === "string" ? valor.trim() : ""; }
function escolher(responsaveis: UsuarioAgenda[], contagens: Map<string, number>) {
  const minimo = Math.min(...responsaveis.map((item) => contagens.get(item.id) ?? 0));
  const empatados = responsaveis.filter((item) => (contagens.get(item.id) ?? 0) === minimo);
  return empatados[Math.floor(Math.random() * empatados.length)];
}

export async function POST(requisicao: Request) {
  let entrada: Record<string, unknown>;
  try { entrada = await requisicao.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ mensagem: "Os dados enviados são inválidos." }, { status: 400 }); }

  const negociacaoId = texto(entrada.negociacao_id).toLowerCase();
  const data = texto(entrada.data_reuniao);
  const horario = texto(entrada.horario_reuniao);
  const observacao = texto(entrada.observacao);
  if (observacao.length > 5_000) return NextResponse.json({ mensagem: "A observação deve ter no máximo 5.000 caracteres." }, { status: 400 });
  const dataHora = dataHoraAgendamento(data, horario);
  if (!dataHora || dataEhFimDeSemana(data) || !HORARIOS_VALIDOS.has(horario)) return NextResponse.json({ mensagem: "Selecione uma data e um horário válidos." }, { status: 400 });
  if (dataHora.getTime() < Date.now() + ANTECEDENCIA_MINIMA_MINUTOS * 60_000) return NextResponse.json({ mensagem: "A reunião deve ser agendada com pelo menos 15 minutos de antecedência." }, { status: 400 });

  let idRegistro = 0;
  let reserva: ReservaGoogle | null = null;
  try {
    const { negociacao, rd } = await carregarContextoNegociacao(negociacaoId);
    const emails = validarEmailsSelecionados(entrada.emails_participantes, negociacao.emails);
    const nomePreVendedor = negociacao.pre_vendedor?.nome;
    if (!nomePreVendedor) {
      throw new Error("A negociação não possui um pré-vendedor responsável no RD.");
    }
    const campoPreVendedor = await rd.obterOpcaoCampoNegociacao(
      ID_CAMPO_PRE_VENDEDOR,
      nomePreVendedor,
    );
    const resultado = await emSerie(async () => {
      const usuarios = usuariosRdComAgenda(await rd.obterUsuariosEquipe(ID_EQUIPE));
      const dia = await consultarDisponibilidadeDia(usuarios, data);
      const disponiveis = dia.find((item) => item.horario === horario)?.responsaveis ?? [];
      if (disponiveis.length === 0) throw new Error("HORARIO_INDISPONIVEL");
      const contagens = await contarAgendamentosPorResponsavel(disponiveis.map((item) => item.id), data);
      const responsavel = escolher(disponiveis, contagens);
      idRegistro = await registrarAgendamento({ negociacaoId, empresaId: negociacao.empresa?.id, responsavelId: responsavel.id, emails, dataHora, observacao });
      const contatosSelecionados = negociacao.contatos.filter((contato) =>
        contato.emails.some((email) => emails.includes(email)),
      );
      const detalhesContatos = contatosSelecionados.flatMap((contato) => {
        const emailsSelecionados = contato.emails.filter((email) =>
          emails.includes(email),
        );
        return [
          `Contato: ${contato.nome}`,
          `Telefone: ${contato.telefones.join(" • ") || "Não informado"}`,
          `E-mail: ${emailsSelecionados.join(", ")}`,
          "",
        ];
      });
      const descricao = [
        `Parceiro: ${negociacao.nome}`,
        "",
        ...detalhesContatos,
        `Pré-vendedor(a): ${negociacao.pre_vendedor?.nome || "Não informado"}`,
      ].join("\n");
      const evento = await criarEventoGoogle({ responsavel, data, horario,
        nomeEmpresa: negociacao.nome,
        emailsParticipantes: Array.from(new Set([...emails, EMAIL_BOT])), descricao, idAgendamento: idRegistro });
      return { responsavel, evento, descricao };
    });
    reserva = resultado.evento;
    const dataHoraRd = formatarDataHoraRd(dataHora)!;
    await rd.atualizarNegociacaoAposAgendamento(
      negociacaoId,
      resultado.responsavel.id,
      ID_ETAPA_AGENDADO,
      { [campoPreVendedor.slug]: campoPreVendedor.valor },
    );
    await rd.criarAnotacaoNegociacao(negociacaoId, ["Reunião agendada pelo Agendamento BDR SST.", `Responsável: ${resultado.responsavel.nome}`, `Data: ${data.split("-").reverse().join("/")} às ${horario}`, `Participantes: ${validarEmailsSelecionados(entrada.emails_participantes, negociacao.emails).join(", ")}`, observacao ? `Observações: ${observacao}` : ""].filter(Boolean).join("\n"));
    const tarefa = await rd.criarTarefaReuniao({ idNegociacao: negociacaoId, nome: "Reunião SST", descricao: resultado.descricao, dataHoraIso: dataHoraRd, idCriador: resultado.responsavel.id });
    await atualizarAgendamento(idRegistro, { status: "sucesso", mensagem: "Reunião criada no RD e Google Agenda.", tarefaRdId: tarefa.id, eventoGoogleId: reserva.id });
    return NextResponse.json({ mensagem: "Reunião agendada com sucesso.", responsavel: resultado.responsavel.nome, data_reuniao: dataHoraRd, evento_google_meet_link: reserva.linkMeet }, { status: 201 });
  } catch (erro) {
    if (reserva) await excluirEventoGoogle(reserva).catch(() => undefined);
    if (idRegistro) await atualizarAgendamento(idRegistro, { status: "erro", mensagem: erro instanceof Error ? erro.message : "Falha de integração." }).catch(() => undefined);
    const indisponivel = erro instanceof Error && erro.message === "HORARIO_INDISPONIVEL";
    const preVendedorInvalido =
      erro instanceof ErroRdV2 &&
      erro.caminho === `/custom_fields/${ID_CAMPO_PRE_VENDEDOR}`;
    const status = preVendedorInvalido ? 422 : indisponivel ? 409 : erro instanceof ErroContextoNegociacao ? erro.status : erro instanceof ErroRdV2 || erro instanceof ErroGoogleAgenda ? 502 : 400;
    const mensagem = preVendedorInvalido
      ? "Responsável da negociação, não é uma opção válida do campo Pre-Vendedor - SSTB2B"
      : indisponivel
        ? "O horário acabou de ficar indisponível. Escolha outro."
        : erro instanceof ErroContextoNegociacao
          ? erro.message
          : erro instanceof Error && status === 400
            ? erro.message
            : "Não foi possível concluir o agendamento neste momento.";
    console.error("Falha no agendamento BDR SST.", erro);
    return NextResponse.json({ mensagem }, { status });
  }
}
