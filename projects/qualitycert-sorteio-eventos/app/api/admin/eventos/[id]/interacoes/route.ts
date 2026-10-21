import { addRoletaAoEvento, addSorteioAoEvento, CodigosEsgotadosError, listInteractionCodes } from '@/db/mysql';
import { authorizeRequest } from '@/lib/session';

export const runtime = 'nodejs';

function textValue(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function publicLink(eventoNome: string, interacao: 'sorteio' | 'roleta', codigo: string) {
  const baseUrl = (process.env.EVENTOS_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${baseUrl}/${encodeURIComponent(eventoNome)}/${interacao}/${encodeURIComponent(codigo)}`;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = authorizeRequest(request, ['Admin']);
  if ('response' in authorization) return authorization.response;
  const { id } = await context.params;
  const eventoId = Number(id);
  const interacao = new URL(request.url).searchParams.get('interacao');
  if (!Number.isInteger(eventoId) || eventoId < 1 || (interacao !== 'sorteio' && interacao !== 'roleta')) {
    return Response.json({ message: 'Evento ou interação inválida.' }, { status: 400 });
  }
  try {
    const rows = await listInteractionCodes(eventoId, interacao);
    if (!rows.length) return Response.json({ message: 'Nenhum código encontrado para esta interação.' }, { status: 404 });
    const eventoNome = rows[0].evento_nome;
    return Response.json({
      eventoId,
      eventoNome,
      prefixo: rows[0].prefixo,
      interacao,
      quantidade: rows.length,
      codigos: rows.map((row) => ({
        codigo: row.codigo_sorteio,
        certificados: interacao === 'roleta' ? Number(row.quantidade_certificados ?? 0) : undefined,
        link: publicLink(eventoNome, interacao, row.codigo_sorteio),
      })),
    });
  } catch {
    return Response.json({ message: 'Não foi possível exportar os códigos.' }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = authorizeRequest(request, ['Admin']);
  if ('response' in authorization) return authorization.response;
  const { id } = await context.params;
  const eventoId = Number(id);
  const payload = await request.json() as { interacao?: unknown; quantidade?: unknown; premio?: unknown; regraPremiacao?: unknown; lotes?: unknown };
  const quantidade = Number(payload.quantidade);
  const premio = textValue(payload.premio, 255);
  const regraPremiacao = textValue(payload.regraPremiacao, 2000);

  if (!Number.isInteger(eventoId) || eventoId < 1) {
    return Response.json({ message: 'Evento inválido.' }, { status: 400 });
  }
  if (payload.interacao !== 'sorteio' && payload.interacao !== 'roleta') {
    return Response.json({ message: 'Selecione uma interação válida.' }, { status: 400 });
  }

  try {
    if (payload.interacao === 'roleta') {
      if (!regraPremiacao) {
        return Response.json({ message: 'Informe a Regra Premiação da Roleta.' }, { status: 400 });
      }
      if (!Array.isArray(payload.lotes) || !payload.lotes.length) {
        return Response.json({ message: 'Adicione ao menos uma quantidade de códigos e certificados.' }, { status: 400 });
      }
      const lotes = payload.lotes.map((item) => {
        const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        return {
          quantidadeCodigos: Number(row.quantidadeCodigos),
          quantidadeCertificados: Number(row.quantidadeCertificados),
        };
      });
      if (lotes.some((lote) => !Number.isInteger(lote.quantidadeCodigos) || lote.quantidadeCodigos < 1
        || !Number.isInteger(lote.quantidadeCertificados) || lote.quantidadeCertificados < 1
        || lote.quantidadeCertificados > 4294967295)) {
        return Response.json({ message: 'Cada linha deve informar a quantidade de códigos e de certificados.' }, { status: 400 });
      }
      const totalCodigos = lotes.reduce((total, lote) => total + lote.quantidadeCodigos, 0);
      if (totalCodigos > 10000) {
        return Response.json({ message: 'A soma dos códigos deve ser de no máximo 10.000.' }, { status: 400 });
      }
      const result = await addRoletaAoEvento({ eventoId, regraPremiacao, lotes });
      if (result.status === 'nao_encontrado') return Response.json({ message: 'Evento não encontrado.' }, { status: 404 });
      if (result.status === 'inativo') return Response.json({ message: 'Ative o evento antes de vincular uma interação.' }, { status: 409 });
      if (result.status === 'ja_vinculado') return Response.json({ message: 'A Roleta já está vinculada a este evento.' }, { status: 409 });
      return Response.json({
        eventoId,
        interacao: 'roleta',
        prefixo: result.prefixo,
        quantidade: totalCodigos,
        codigos: result.codigos.map((item) => ({ codigo: item.codigo, certificados: item.quantidadeCertificados, link: publicLink(result.eventoNome, 'roleta', item.codigo) })),
      }, { status: 201 });
    }

    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10000) {
      return Response.json({ message: 'A quantidade deve estar entre 1 e 10.000.' }, { status: 400 });
    }
    if (!premio) {
      return Response.json({ message: 'Informe o prêmio do Sorteio.' }, { status: 400 });
    }
    const result = await addSorteioAoEvento({ eventoId, quantidade, premio });
    if (result.status === 'nao_encontrado') return Response.json({ message: 'Evento não encontrado.' }, { status: 404 });
    if (result.status === 'inativo') return Response.json({ message: 'Ative o evento antes de vincular uma interação.' }, { status: 409 });
    if (result.status === 'ja_vinculado') return Response.json({ message: 'O Sorteio já está vinculado a este evento.' }, { status: 409 });

    return Response.json({
      eventoId,
      interacao: 'sorteio',
      prefixo: result.prefixo,
      premio,
      quantidade,
      codigos: result.codigos.map((codigo) => ({ codigo, link: publicLink(result.eventoNome, 'sorteio', codigo) })),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof CodigosEsgotadosError) {
      return Response.json({ message: error.message }, { status: 409 });
    }
    return Response.json({ message: 'Não foi possível vincular a interação.' }, { status: 500 });
  }
}
