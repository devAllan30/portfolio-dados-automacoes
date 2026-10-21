import { findWinner, selectWinner } from '@/db/mysql';
import { authorizeRequest } from '@/lib/session';

export const runtime = 'nodejs';

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 100);
}

export async function GET(request: Request, context: { params: Promise<{ codigo: string }> }) {
  const authorization = authorizeRequest(request, ['Admin', 'User']);
  if ('response' in authorization) return authorization.response;
  const { codigo } = await context.params;
  const eventoId = Number(new URL(request.url).searchParams.get('eventoId'));
  const normalizedCode = normalizeCode(codigo);

  try {
    const winner = await findWinner(eventoId, normalizedCode);
    if (!winner) {
      return Response.json({ message: 'Código utilizado não encontrado neste evento.' }, { status: 404 });
    }
    return Response.json({
      eventoId: winner.evento_id,
      eventoNome: winner.evento_nome,
      codigo: winner.codigo_sorteio,
      nome: winner.nome,
      telefone: winner.telefone,
      email: winner.email,
      cpf: winner.cpf,
      contabilidade: winner.contabilidade,
      cnpj: winner.cnpj,
      preenchidoEm: winner.preenchido_em,
    });
  } catch {
    return Response.json({ message: 'Banco de dados temporariamente indisponível.' }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ codigo: string }> }) {
  const authorization = authorizeRequest(request, ['Admin', 'User']);
  if ('response' in authorization) return authorization.response;
  const { codigo } = await context.params;
  const payload = await request.json() as { eventoId?: unknown };
  const eventoId = Number(payload.eventoId);
  const normalizedCode = normalizeCode(codigo);

  try {
    const result = await selectWinner(eventoId, normalizedCode);
    if (result.status === 'ja_selecionado') {
      return Response.json({ message: 'Este evento já possui um ganhador selecionado.' }, { status: 409 });
    }
    if (result.status !== 'selecionado') {
      return Response.json({ message: 'Participação não encontrada para este evento.' }, { status: 404 });
    }
    return Response.json({ ok: true, ganhador: result.nome, codigo: normalizedCode });
  } catch {
    return Response.json({ message: 'Não foi possível registrar o ganhador.' }, { status: 503 });
  }
}
