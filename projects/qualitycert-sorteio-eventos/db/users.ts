import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from './mysql';

export type UsuarioTipo = 'Admin' | 'User';

export type Usuario = {
  id: number;
  login: string;
  senha: string;
  tipo: UsuarioTipo;
};

export class UsuarioJaExisteError extends Error {
  constructor() {
    super('Já existe um usuário com este login.');
    this.name = 'UsuarioJaExisteError';
  }
}

export async function findUsuarioByLogin(login: string) {
  const [rows] = await getPool().execute<(RowDataPacket & Usuario)[]>(
    'SELECT id, login, senha, tipo FROM Usuario WHERE login = ? LIMIT 1',
    [login],
  );
  return rows[0] ?? null;
}

export async function saveUsuario(input: { login: string; senha: string; tipo: UsuarioTipo }) {
  const [result] = await getPool().execute<ResultSetHeader>(
    `INSERT INTO Usuario (login, senha, tipo)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE senha = VALUES(senha), tipo = VALUES(tipo)`,
    [input.login, input.senha, input.tipo],
  );
  return result.insertId;
}

export async function createUsuario(input: { login: string; senha: string; tipo: UsuarioTipo }) {
  try {
    const [result] = await getPool().execute<ResultSetHeader>(
      'INSERT INTO Usuario (login, senha, tipo) VALUES (?, ?, ?)',
      [input.login, input.senha, input.tipo],
    );
    return result.insertId;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      throw new UsuarioJaExisteError();
    }
    throw error;
  }
}
