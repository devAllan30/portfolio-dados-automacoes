import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, type SessionRole, verifySessionToken } from './session';

export async function currentSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requirePageRole(allowedRoles: SessionRole[]) {
  const session = await currentSession();
  if (!session) redirect('/');
  if (!allowedRoles.includes(session.tipo)) {
    redirect(session.tipo === 'User' ? '/pesquisar' : '/');
  }
  return session;
}
