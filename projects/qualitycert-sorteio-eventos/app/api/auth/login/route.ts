import { NextResponse } from 'next/server';
import { findUsuarioByLogin } from '@/db/users';
import { cookieIsSecure, createSessionToken, SESSION_COOKIE, SESSION_DURATION_SECONDS } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let payload: { login?: unknown; senha?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: 'Dados de acesso inválidos.' }, { status: 400 });
  }

  const login = typeof payload.login === 'string' ? payload.login.trim().toLowerCase().slice(0, 100) : '';
  const senha = typeof payload.senha === 'string' ? payload.senha.slice(0, 255) : '';
  if (!login || !senha) {
    return Response.json({ message: 'Informe usuário e senha.' }, { status: 400 });
  }

  try {
    const usuario = await findUsuarioByLogin(login);
    if (!usuario || usuario.senha !== senha) {
      return Response.json({ message: 'Usuário ou senha inválidos.' }, { status: 401 });
    }

    const token = createSessionToken({ userId: Number(usuario.id), login: usuario.login, tipo: usuario.tipo });
    const response = NextResponse.json({
      ok: true,
      tipo: usuario.tipo,
      redirectTo: usuario.tipo === 'Admin' ? '/gerenciadorEventos' : '/pesquisar',
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: cookieIsSecure(),
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_SECONDS,
    });
    return response;
  } catch {
    return Response.json({ message: 'Não foi possível acessar o sistema.' }, { status: 503 });
  }
}
