import { getDashboardEvento, listDashboardEventos } from '@/db/mysql';
import { authorizeRequest } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authorization = authorizeRequest(request, ['Admin', 'User']);
  if ('response' in authorization) return authorization.response;

  const eventIdValue = new URL(request.url).searchParams.get('eventoId');
  try {
    if (!eventIdValue) {
      const rows = await listDashboardEventos();
      return Response.json({ eventos: rows.map((row) => ({
        id: Number(row.id),
        nomeEvento: row.nome_evento,
        prefixo: row.prefixo,
        ativo: Boolean(row.ativo),
        dataInicio: row.data_inicio,
        dataFinal: row.data_final,
        tipoInteracao: row.tipo_interacao,
      })) });
    }

    const eventoId = Number(eventIdValue);
    if (!Number.isInteger(eventoId) || eventoId < 1) {
      return Response.json({ message: 'Evento inválido.' }, { status: 400 });
    }
    const result = await getDashboardEvento(eventoId);
    if (!result) return Response.json({ message: 'Evento não encontrado.' }, { status: 404 });
    return Response.json({
      evento: {
        id: Number(result.evento.id),
        nomeEvento: result.evento.nome_evento,
        prefixo: result.evento.prefixo,
        ativo: Boolean(result.evento.ativo),
        dataInicio: result.evento.data_inicio,
        dataFinal: result.evento.data_final,
      },
      sorteio: {
        total: Number(result.sorteio?.total ?? 0),
        utilizados: Number(result.sorteio?.utilizados ?? 0),
        disponiveis: Number(result.sorteio?.disponiveis ?? 0),
      },
      roleta: result.roleta.map((row) => ({
        quantidadeCertificados: Number(row.quantidade_certificados ?? 0),
        total: Number(row.total),
        utilizados: Number(row.utilizados),
        disponiveis: Number(row.disponiveis),
      })),
    });
  } catch {
    return Response.json({ message: 'Não foi possível carregar o Dashboard.' }, { status: 503 });
  }
}
