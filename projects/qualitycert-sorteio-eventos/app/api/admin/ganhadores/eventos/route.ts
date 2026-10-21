import { listEventos } from '@/db/mysql';
import { authorizeRequest } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authorization = authorizeRequest(request, ['Admin', 'User']);
  if ('response' in authorization) return authorization.response;
  try {
    const rows = await listEventos();
    return Response.json({
      eventos: rows.filter((row) => Boolean(row.ativo)).map((row) => ({
        id: Number(row.id),
        nomeEvento: row.nome_evento,
        prefixo: row.prefixo,
        dataInicio: row.data_inicio,
        dataFinal: row.data_final,
        premio: row.premio,
        ganhador: row.ganhador,
        ganhadorCodigo: row.ganhador_codigo,
        totalUtilizados: Number(row.total_utilizados),
      })),
    });
  } catch {
    return Response.json({ message: 'Banco de dados temporariamente indisponível.' }, { status: 503 });
  }
}
