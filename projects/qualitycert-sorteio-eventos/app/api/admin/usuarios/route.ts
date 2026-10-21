import { createUsuario, UsuarioJaExisteError, type UsuarioTipo } from '@/db/users';
import { authorizeRequest } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authorization = authorizeRequest(request, ['Admin']);
  if ('response' in authorization) return authorization.response;

  let payload: { login?: unknown; senha?: unknown; tipo?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: 'Dados do usuário inválidos.' }, { status: 400 });
  }

  const login = typeof payload.login === 'string' ? payload.login.trim().toLowerCase().slice(0, 100) : '';
  const senha = typeof payload.senha === 'string' ? payload.senha.slice(0, 255) : '';
  const tipo = payload.tipo as UsuarioTipo | undefined;

  if (!/^[a-z0-9._-]{3,100}$/.test(login)) {
    return Response.json({ message: 'O login deve possuir ao menos três caracteres e usar somente letras, números, ponto, hífen ou sublinhado.' }, { status: 400 });
  }
  if (senha.length < 8) {
    return Response.json({ message: 'A senha deve possuir ao menos oito caracteres.' }, { status: 400 });
  }
  if (tipo !== 'Admin' && tipo !== 'User') {
    return Response.json({ message: 'Selecione o tipo User ou Admin.' }, { status: 400 });
  }

  try {
    const id = await createUsuario({ login, senha, tipo });
    return Response.json({ id, login, tipo }, { status: 201 });
  } catch (error) {
    if (error instanceof UsuarioJaExisteError) {
      return Response.json({ message: error.message }, { status: 409 });
    }
    return Response.json({ message: 'Não foi possível criar o usuário.' }, { status: 503 });
  }
}
