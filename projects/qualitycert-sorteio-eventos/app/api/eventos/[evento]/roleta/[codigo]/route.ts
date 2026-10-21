import { findEventoRoleta, registerParticipation } from '@/db/mysql';

export const runtime = 'nodejs';

type ParticipationPayload = {
  nome?: unknown;
  telefone?: unknown;
  email?: unknown;
  cpf?: unknown;
  contabilidade?: unknown;
  cnpj?: unknown;
};

function digits(value: string) { return value.replace(/\D/g, ''); }

function validCpf(value: string) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length: number) => {
    const total = cpf.slice(0, length).split('').reduce((sum, digit, index) => sum + Number(digit) * (length + 1 - index), 0);
    const result = (total * 10) % 11;
    return (result === 10 ? 0 : result) === Number(cpf[length]);
  };
  return check(9) && check(10);
}

function validCnpj(value: string) {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calculate = (length: number) => {
    const weights = length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const total = cnpj.slice(0, length).split('').reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(cnpj[12]) && calculate(13) === Number(cnpj[13]);
}

function textValue(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export async function GET(_request: Request, context: { params: Promise<{ evento: string; codigo: string }> }) {
  const { evento, codigo } = await context.params;
  try {
    const row = await findEventoRoleta(codigo, evento);
    if (!row) return Response.json({ status: 'invalido' }, { status: 404 });
    const response = {
      status: row.status,
      eventoNome: row.evento_nome,
      eventoId: row.evento_id,
      quantidadeCertificados: Number(row.quantidade_certificados ?? 0),
      regraPremiacao: row.regra_premiacao,
    };
    if (!row.evento_ativo || !row.codigo_ativo) return Response.json({ ...response, status: 'inativo' }, { status: 403 });
    return Response.json(response);
  } catch {
    return Response.json({ status: 'erro', message: 'Banco de dados temporariamente indisponível.' }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ evento: string; codigo: string }> }) {
  const { evento, codigo } = await context.params;
  const payload = await request.json() as ParticipationPayload;
  const nome = textValue(payload.nome, 160);
  const telefone = textValue(payload.telefone, 24);
  const email = textValue(payload.email, 200).toLowerCase();
  const cpf = textValue(payload.cpf, 14);
  const contabilidade = textValue(payload.contabilidade, 180);
  const cnpj = textValue(payload.cnpj, 18);

  if (!nome || !telefone || !email || !cpf || !contabilidade) return Response.json({ message: 'Preencha todos os campos obrigatórios.' }, { status: 400 });
  if (digits(telefone).length < 10 || digits(telefone).length > 11) return Response.json({ message: 'Informe um telefone válido.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ message: 'Informe um e-mail válido.' }, { status: 400 });
  if (!validCpf(cpf)) return Response.json({ message: 'Informe um CPF válido.' }, { status: 400 });
  if (cnpj && !validCnpj(cnpj)) return Response.json({ message: 'Informe um CNPJ válido ou deixe o campo vazio.' }, { status: 400 });

  try {
    const wheel = await findEventoRoleta(codigo, evento);
    if (!wheel) return Response.json({ code: 'CODIGO_INVALIDO', message: 'Código da Roleta inválido.' }, { status: 404 });
    if (!wheel.evento_ativo || !wheel.codigo_ativo) return Response.json({ code: 'EVENTO_INATIVO', message: 'Este código não está ativo para novos cadastros.' }, { status: 403 });
    if (wheel.status === 'utilizado') return Response.json({ code: 'CODIGO_UTILIZADO', message: 'Os certificados deste código já foram garantidos.' }, { status: 409 });

    const normalizedCpf = digits(cpf);
    const updated = await registerParticipation({
      eventoId: wheel.evento_id,
      tipoInteracao: 'roleta',
      codigo,
      nome,
      telefone,
      email,
      cpf: normalizedCpf,
      contabilidade,
      cnpj: cnpj ? digits(cnpj) : null,
      urlOrigem: request.url,
    });
    if (!updated) {
      const existing = await findEventoRoleta(codigo, evento);
      const inactive = existing && (!existing.evento_ativo || !existing.codigo_ativo);
      return Response.json({
        code: inactive ? 'EVENTO_INATIVO' : existing?.status === 'utilizado' ? 'CODIGO_UTILIZADO' : 'CODIGO_INVALIDO',
        message: inactive ? 'Este código não está ativo para novos cadastros.' : existing?.status === 'utilizado' ? 'Os certificados deste código já foram garantidos.' : 'Código da Roleta inválido.',
      }, { status: inactive ? 403 : existing ? 409 : 404 });
    }
    return Response.json({ ok: true, codigo, quantidadeCertificados: Number(wheel.quantidade_certificados ?? 0) });
  } catch {
    return Response.json({ message: 'Banco de dados temporariamente indisponível.' }, { status: 503 });
  }
}
