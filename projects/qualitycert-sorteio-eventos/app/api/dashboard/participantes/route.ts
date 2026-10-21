import { listDashboardParticipantes } from '@/db/mysql';
import { authorizeRequest } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authorization = authorizeRequest(request, ['Admin', 'User']);
  if ('response' in authorization) return authorization.response;
  const params = new URL(request.url).searchParams;
  const eventoId = Number(params.get('eventoId'));
  const interacao = params.get('interacao');
  const nome = (params.get('nome') ?? '').trim().slice(0, 160);
  const certificateValue = params.get('certificados');
  const quantidadeCertificados = certificateValue === null ? undefined : Number(certificateValue);

  if (!Number.isInteger(eventoId) || eventoId < 1 || (interacao !== 'sorteio' && interacao !== 'roleta')) {
    return Response.json({ message: 'Evento ou interação inválida.' }, { status: 400 });
  }
  if (quantidadeCertificados !== undefined && (!Number.isInteger(quantidadeCertificados) || quantidadeCertificados < 1)) {
    return Response.json({ message: 'Quantidade de certificados inválida.' }, { status: 400 });
  }
  try {
    const result = await listDashboardParticipantes({ eventoId, interacao, nome, quantidadeCertificados });
    return Response.json({
      total: result.total,
      participantes: result.rows.map((row) => ({
        id: Number(row.id),
        codigo: row.codigo_sorteio,
        quantidadeCertificados: row.quantidade_certificados === null ? null : Number(row.quantidade_certificados),
        nome: row.nome,
        telefone: row.telefone,
        email: row.email,
        cpf: row.cpf,
        contabilidade: row.contabilidade,
        cnpj: row.cnpj,
        preenchidoEm: row.preenchido_em,
      })),
    });
  } catch {
    return Response.json({ message: 'Não foi possível carregar os participantes.' }, { status: 503 });
  }
}
