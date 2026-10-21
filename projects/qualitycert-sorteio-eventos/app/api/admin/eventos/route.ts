import { createEvento, EventoJaExisteError, listEventos } from '@/db/mysql';
import { authorizeRequest } from '@/lib/session';

export const runtime = 'nodejs';

function textValue(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function dateValue(value: unknown) {
  const date = textValue(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function serializeEvent(row: Awaited<ReturnType<typeof listEventos>>[number]) {
  return {
    id: Number(row.id),
    nomeEvento: row.nome_evento,
    prefixo: row.prefixo,
    dataCriacao: row.data_criacao,
    dataInicio: row.data_inicio,
    dataFinal: row.data_final,
    premio: row.premio,
    tipoInteracao: row.tipo_interacao,
    ativo: Boolean(row.ativo),
    ganhador: row.ganhador,
    ganhadorCodigo: row.ganhador_codigo,
    totalCodigos: Number(row.total_codigos),
    totalUtilizados: Number(row.total_utilizados),
  };
}

export async function GET(request: Request) {
  const authorization = authorizeRequest(request, ['Admin']);
  if ('response' in authorization) return authorization.response;
  try {
    const events = await listEventos();
    return Response.json({ eventos: events.map(serializeEvent) });
  } catch {
    return Response.json({ message: 'Banco de dados temporariamente indisponível.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authorization = authorizeRequest(request, ['Admin']);
  if ('response' in authorization) return authorization.response;
  const payload = await request.json() as Record<string, unknown>;
  const eventoNome = textValue(payload.nomeEvento, 220);
  const prefixo = textValue(payload.prefixo, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const dataInicio = dateValue(payload.dataInicio);
  const dataFinal = dateValue(payload.dataFinal);

  if (eventoNome.length < 3) {
    return Response.json({ message: 'Informe um nome de evento válido.' }, { status: 400 });
  }
  if (prefixo.length !== 3) {
    return Response.json({ message: 'O prefixo deve possuir exatamente três letras ou números.' }, { status: 400 });
  }
  if (!dataInicio || !dataFinal || dataFinal < dataInicio) {
    return Response.json({ message: 'Informe um período válido para o evento.' }, { status: 400 });
  }
  try {
    const created = await createEvento({
      eventoNome,
      prefixo,
      dataInicio,
      dataFinal,
    });
    return Response.json({
      eventoId: created.eventoId,
      eventoNome,
      prefixo,
      dataInicio,
      dataFinal,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof EventoJaExisteError) {
      return Response.json({ message: 'Este evento já foi cadastrado.' }, { status: 409 });
    }
    return Response.json({ message: 'Não foi possível criar o evento.' }, { status: 500 });
  }
}
