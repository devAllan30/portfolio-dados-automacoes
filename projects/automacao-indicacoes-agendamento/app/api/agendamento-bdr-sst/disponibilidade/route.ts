import { NextResponse } from "next/server";
import { dataAgendamentoValida, dataEhFimDeSemana } from "../../../../lib/data-agendamento";
import { ClienteRdV2 } from "../../../../lib/agendamento-bdr-sst/rd-station-v2";
import { consultarDisponibilidadeDia, usuariosRdComAgenda } from "../../../../lib/agendamento-bdr-sst/google-calendar";

const ID_EQUIPE = process.env.RD_EQUIPE_CLOSER?.trim() || "679294fc3e41190018178cb4";

export async function GET(requisicao: Request) {
  const data = new URL(requisicao.url).searchParams.get("data")?.trim() ?? "";
  if (!dataAgendamentoValida(data) || dataEhFimDeSemana(data)) {
    return NextResponse.json({ mensagem: "Selecione uma data válida em um dia útil." }, { status: 400 });
  }
  try {
    const rd = await ClienteRdV2.criar();
    const usuarios = usuariosRdComAgenda(await rd.obterUsuariosEquipe(ID_EQUIPE));
    const disponibilidade = await consultarDisponibilidadeDia(usuarios, data);
    return NextResponse.json({
      horarios: disponibilidade.filter((item) => item.responsaveis.length > 0).map((item) => item.horario),
      duracao_minutos: 30,
      fuso_horario: "America/Sao_Paulo",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    console.error("Falha ao consultar disponibilidade BDR SST.", erro);
    return NextResponse.json({ mensagem: "Não foi possível consultar os horários neste momento." }, { status: 502 });
  }
}
