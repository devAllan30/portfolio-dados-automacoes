import { NextResponse } from "next/server";

import {
  authenticateManager,
  endManagerSession,
  MANAGER_SESSION_COOKIE,
  ManagerUnauthorizedError,
  managerSessionMaxAge,
  requireManagerSession,
} from "@/lib/manager-auth";

function unauthorized(error: unknown) {
  return NextResponse.json(
    { message: error instanceof Error ? error.message : "Acesso não autorizado." },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  try {
    return NextResponse.json({ user: await requireManagerSession(request) });
  } catch (error) {
    return unauthorized(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { login?: unknown; password?: unknown };
    const login = typeof body.login === "string" ? body.login : "";
    const password = typeof body.password === "string" ? body.password : "";
    const authenticated = await authenticateManager(login, password);
    const response = NextResponse.json({ user: authenticated.user });
    response.cookies.set(MANAGER_SESSION_COOKIE, authenticated.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: managerSessionMaxAge,
    });
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) return unauthorized(new Error("Dados de login inválidos."));
    if (error instanceof ManagerUnauthorizedError) return unauthorized(error);
    return NextResponse.json({ message: "Não foi possível realizar o login." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  await endManagerSession(request);
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(MANAGER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
