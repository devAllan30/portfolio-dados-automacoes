import { join } from 'node:path';
import { config } from 'dotenv';
import { getPool } from '../db/mysql';
import { saveUsuario, type UsuarioTipo } from '../db/users';

config({ path: join(process.cwd(), '.env.local'), quiet: true });

const login = process.env.USUARIO_LOGIN?.trim().toLowerCase() ?? '';
const senha = process.env.USUARIO_SENHA ?? '';
const tipo = process.env.USUARIO_TIPO as UsuarioTipo | undefined;

if (!/^[a-z0-9._-]{3,100}$/.test(login)) {
  throw new Error('USUARIO_LOGIN deve possuir de 3 a 100 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.');
}
if (senha.length < 8 || senha.length > 255) {
  throw new Error('USUARIO_SENHA deve possuir de 8 a 255 caracteres.');
}
if (tipo !== 'Admin' && tipo !== 'User') {
  throw new Error('USUARIO_TIPO deve ser Admin ou User.');
}

try {
  await saveUsuario({ login, senha, tipo });
  console.log(`Usuário ${login} salvo com o tipo ${tipo}.`);
} finally {
  await getPool().end();
}
