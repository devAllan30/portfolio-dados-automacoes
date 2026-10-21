import { NextResponse } from 'next/server';
import { cookieIsSecure, SESSION_COOKIE } from '@/lib/session';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: cookieIsSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
