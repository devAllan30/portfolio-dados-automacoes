import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'qualitycert_eventos_session';
export const SESSION_DURATION_SECONDS = 8 * 60 * 60;

export type SessionRole = 'Admin' | 'User';
export type SessionData = {
  userId: number;
  login: string;
  tipo: SessionRole;
  exp: number;
};

function sessionSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error('AUTH_SECRET deve possuir pelo menos 32 caracteres.');
  }
  return value;
}

function signature(payload: string) {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(input: Omit<SessionData, 'exp'>) {
  const data: SessionData = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionData | null {
  if (!token) return null;
  const [payload, receivedSignature, extra] = token.split('.');
  if (!payload || !receivedSignature || extra) return null;

  const expected = Buffer.from(signature(payload));
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SessionData>;
    if (!Number.isInteger(data.userId) || typeof data.login !== 'string'
      || (data.tipo !== 'Admin' && data.tipo !== 'User')
      || typeof data.exp !== 'number' || data.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return data as SessionData;
  } catch {
    return null;
  }
}

function cookieValue(header: string | null, name: string) {
  if (!header) return null;
  for (const item of header.split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export function sessionFromRequest(request: Request) {
  return verifySessionToken(cookieValue(request.headers.get('cookie'), SESSION_COOKIE));
}

export function cookieIsSecure() {
  return process.env.AUTH_COOKIE_SECURE === 'true';
}

export function authorizeRequest(request: Request, allowedRoles: SessionRole[]) {
  const session = sessionFromRequest(request);
  if (!session) {
    return { response: Response.json({ message: 'Sessão inválida ou expirada.' }, { status: 401 }) } as const;
  }
  if (!allowedRoles.includes(session.tipo)) {
    return { response: Response.json({ message: 'Você não possui permissão para esta operação.' }, { status: 403 }) } as const;
  }
  return { session } as const;
}
