import { setEventoAtivo } from '@/db/mysql';
import { authorizeRequest } from '@/lib/session';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = authorizeRequest(request, ['Admin']);
  if ('response' in authorization) return authorization.response;
  const { id } = await context.params;
  const eventoId = Number(id);
  const payload = await request.json() as { ativo?: unknown };

  if (!Number.isInteger(eventoId) || eventoId < 1 || typeof payload.ativo !== 'boolean') {
    return Response.json({ message: 'Informe um evento e um estado válidos.' }, { status: 400 });
  }

  try {
    const result = await setEventoAtivo(eventoId, payload.ativo);
    if (result.status === 'nao_encontrado') {
      return Response.json({ message: 'Evento não encontrado.' }, { status: 404 });
    }
    if (result.status === 'expirado') {
      return Response.json({ message: 'Não é possível reativar um evento com a data final vencida.' }, { status: 409 });
    }
    return Response.json({ ok: true, ativo: result.ativo });
  } catch {
    return Response.json({ message: 'Não foi possível alterar o evento.' }, { status: 503 });
  }
}
