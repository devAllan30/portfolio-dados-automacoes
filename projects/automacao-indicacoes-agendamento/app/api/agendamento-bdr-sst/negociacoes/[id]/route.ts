import { NextResponse } from "next/server";
import { carregarContextoNegociacao, ErroContextoNegociacao } from "../../../../../lib/agendamento-bdr-sst/contexto-negociacao";
import { ErroRdV2 } from "../../../../../lib/agendamento-bdr-sst/rd-station-v2";

export async function GET(_requisicao: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  try {
    const resultado = await carregarContextoNegociacao(id.trim().toLowerCase());
    return NextResponse.json(resultado.negociacao, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    console.error("Falha ao carregar negociação do RD Station.", {
      status: erro instanceof ErroRdV2 ? erro.status : null,
      caminho: erro instanceof ErroRdV2 ? erro.caminho : null,
      detalhes: erro instanceof ErroRdV2 ? erro.detalhes : null,
      mensagem: erro instanceof Error ? erro.message : "Erro desconhecido",
    });
    const status = erro instanceof ErroContextoNegociacao ? erro.status : erro instanceof ErroRdV2 && erro.status === 404 ? 404 : 502;
    return NextResponse.json({ mensagem: erro instanceof ErroContextoNegociacao ? erro.message : "Não foi possível carregar os dados da negociação no RD Station." }, { status });
  }
}
