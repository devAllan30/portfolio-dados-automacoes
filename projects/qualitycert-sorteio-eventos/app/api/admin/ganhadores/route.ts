import { searchUsedRaffleCodes } from '@/db/mysql';
import { authorizeRequest } from '@/lib/session';

export const runtime = 'nodejs';

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 100);
}

export async function GET(request: Request) {
  const authorization = authorizeRequest(request, ['Admin', 'User']);
  if ('response' in authorization) return authorization.response;
  const url = new URL(request.url);
  const eventoId = Number(url.searchParams.get('eventoId'));
  const codigo = normalizeCode(url.searchParams.get('codigo') ?? '');
  if (!Number.isInteger(eventoId) || eventoId < 1 || codigo.length < 4) {
    return Response.json({ codigos: [] });
  }

  try {
    const rows = await searchUsedRaffleCodes(eventoId, codigo);
    return Response.json({ codigos: rows.map((row) => ({ codigo: row.codigo_sorteio })) });
  } catch {
    return Response.json({ message: 'Banco de dados temporariamente indisponível.' }, { status: 503 });
  }
}
