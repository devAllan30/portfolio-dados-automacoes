import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { type RowDataPacket } from "mysql2/promise";

import { openMySqlConnection } from "@/lib/mysql";

const SESSION_HOURS = 8;

export const MANAGER_SESSION_COOKIE = "manager_session";

type ManagerUserRow = RowDataPacket & {
  Login: string;
  senha: string;
};

export type ManagerUser = { login: string };

export class ManagerUnauthorizedError extends Error {
  constructor(message = "Faça login para acessar o gerenciador.") {
    super(message);
    this.name = "ManagerUnauthorizedError";
  }
}

function normalizeLogin(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return "";
}

function safeEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

function createSessionToken(login: string, password: string) {
  const payload = Buffer.from(
    JSON.stringify({
      login,
      expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
      nonce: randomBytes(16).toString("base64url"),
    }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", password).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export async function authenticateManager(rawLogin: string, password: string) {
  const login = normalizeLogin(rawLogin);
  if (!login || !password) throw new ManagerUnauthorizedError("Login ou senha inválidos.");

  const connection = await openMySqlConnection();
  try {
    const [rows] = await connection.execute<ManagerUserRow[]>(
      "SELECT Login, senha FROM usuarios_gerenciador WHERE Login = ? AND Ativo = 1 LIMIT 1",
      [login],
    );
    const user = rows[0];
    if (!user) throw new ManagerUnauthorizedError("Login ou senha inválidos.");

    if (!safeEqual(password, user.senha)) {
      throw new ManagerUnauthorizedError("Login ou senha inválidos.");
    }

    return {
      token: createSessionToken(user.Login, user.senha),
      user: { login: user.Login } satisfies ManagerUser,
    };
  } finally {
    await connection.end();
  }
}

export async function requireManagerSession(request: Request): Promise<ManagerUser> {
  const token = readCookie(request, MANAGER_SESSION_COOKIE);
  if (!token) throw new ManagerUnauthorizedError();

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new ManagerUnauthorizedError("Sua sessão expirou. Faça login novamente.");
  }

  let payload: { login?: unknown; expiresAt?: unknown };
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      login?: unknown;
      expiresAt?: unknown;
    };
  } catch {
    throw new ManagerUnauthorizedError("Sua sessão expirou. Faça login novamente.");
  }
  if (
    typeof payload.login !== "string" ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= Date.now()
  ) {
    throw new ManagerUnauthorizedError("Sua sessão expirou. Faça login novamente.");
  }

  const connection = await openMySqlConnection();
  try {
    const [rows] = await connection.execute<ManagerUserRow[]>(
      "SELECT Login, senha FROM usuarios_gerenciador WHERE Login = ? AND Ativo = 1 LIMIT 1",
      [normalizeLogin(payload.login)],
    );
    const user = rows[0];
    if (!user) throw new ManagerUnauthorizedError("Sua sessão expirou. Faça login novamente.");
    const expectedSignature = createHmac("sha256", user.senha)
      .update(encodedPayload)
      .digest("base64url");
    if (!safeEqual(signature, expectedSignature)) {
      throw new ManagerUnauthorizedError("Sua sessão expirou. Faça login novamente.");
    }
    return { login: user.Login };
  } finally {
    await connection.end();
  }
}

export async function endManagerSession() {}

export const managerSessionMaxAge = SESSION_HOURS * 60 * 60;
