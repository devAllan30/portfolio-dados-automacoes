import { cpfAlreadyRegistered, findEvento, registerParticipation } from '@/db/mysql';

export const runtime = 'nodejs';

type ParticipationPayload = {
  nome?: unknown;
  telefone?: unknown;
  email?: unknown;
  cpf?: unknown;
  contabilidade?: unknown;
  cnpj?: unknown;
};

function digits(value: string) {
  return value.replace(/\D/g, '');
}

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
    const row = await findEvento(codigo, evento);
    if (!row) return Response.json({ status: 'invalido' }, { status: 404 });
    if (!row.evento_ativo || !row.codigo_ativo) {
      return Response.json({ status: 'inativo', eventoNome: row.evento_nome, eventoId: row.evento_id, premio: row.premio }, { status: 403 });
    }
    return Response.json({ status: row.status, eventoNome: row.evento_nome, eventoId: row.evento_id, premio: row.premio });
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

  if (!nome || !telefone || !email || !cpf || !contabilidade) {
    return Response.json({ message: 'Preencha todos os campos obrigatórios.' }, { status: 400 });
  }
  if (digits(telefone).length < 10 || digits(telefone).length > 11) {
    return Response.json({ message: 'Informe um telefone válido.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ message: 'Informe um e-mail válido.' }, { status: 400 });
  }
  if (!validCpf(cpf)) {
    return Response.json({ message: 'Informe um CPF válido.' }, { status: 400 });
  }
  if (cnpj && !validCnpj(cnpj)) {
    return Response.json({ message: 'Informe um CNPJ válido ou deixe o campo vazio.' }, { status: 400 });
  }

  try {
    const raffle = await findEvento(codigo, evento);
    if (!raffle) {
      return Response.json({ code: 'CODIGO_INVALIDO', message: 'Código de sorteio inválido.' }, { status: 404 });
    }
    if (!raffle.evento_ativo || !raffle.codigo_ativo) {
      return Response.json({ code: 'EVENTO_INATIVO', message: 'Esta ficha não está ativa para novas participações.' }, { status: 403 });
    }
    if (raffle.status === 'utilizado') {
      return Response.json({ code: 'CODIGO_UTILIZADO', message: 'Este número já foi utilizado.' }, { status: 409 });
    }

    const normalizedCpf = digits(cpf);
    if (await cpfAlreadyRegistered(raffle.evento_id, normalizedCpf)) {
      return Response.json(
        { code: 'CPF_JA_CADASTRADO', message: 'Este CPF já está participando deste evento.' },
        { status: 409 },
      );
    }

    const updated = await registerParticipation({
      eventoId: raffle.evento_id,
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
      const existing = await findEvento(codigo, evento);
      return Response.json(
        {
          code: existing && (!existing.evento_ativo || !existing.codigo_ativo) ? 'EVENTO_INATIVO' : existing?.status === 'utilizado' ? 'CODIGO_UTILIZADO' : 'CODIGO_INVALIDO',
          message: existing && (!existing.evento_ativo || !existing.codigo_ativo) ? 'Esta ficha não está ativa para novas participações.' : existing?.status === 'utilizado' ? 'Este número já foi utilizado.' : 'Código de sorteio inválido.',
        },
        { status: existing && (!existing.evento_ativo || !existing.codigo_ativo) ? 403 : existing ? 409 : 404 },
      );
    }

    return Response.json({ ok: true, codigo });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      return Response.json(
        { code: 'CPF_JA_CADASTRADO', message: 'Este CPF já está participando deste evento.' },
        { status: 409 },
      );
    }
    return Response.json({ message: 'Banco de dados temporariamente indisponível.' }, { status: 503 });
  }
}
