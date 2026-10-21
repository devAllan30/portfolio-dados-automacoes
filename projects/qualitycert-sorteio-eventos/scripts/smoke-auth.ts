import { join } from 'node:path';
import { config } from 'dotenv';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/mysql';
import { saveUsuario } from '../db/users';

config({ path: join(process.cwd(), '.env.local'), quiet: true });

const stamp = Date.now().toString();
const adminLogin = `admin.teste.${stamp}`;
const userLogin = `user.teste.${stamp}`;
const adminPassword = `Admin-${stamp}!`;
const userPassword = `User-${stamp}!`;
const managedLogin = `novo.user.${stamp}`;
const managedPassword = `Novo-${stamp}!`;
const pool = getPool();

function cookieFrom(response: Response) {
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('A autenticação não retornou o cookie de sessão.');
  return header.split(';', 1)[0];
}

async function login(loginValue: string, password: string) {
  return fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginValue, senha: password }),
  });
}

try {
  await saveUsuario({ login: adminLogin, senha: adminPassword, tipo: 'Admin' });
  await saveUsuario({ login: userLogin, senha: userPassword, tipo: 'User' });

  const loginPage = await fetch('http://localhost:3000/');
  if (loginPage.status !== 200 || !await loginPage.text().then((html) => html.includes('Acesso ao sistema'))) {
    throw new Error('A raiz não apresentou a tela de login.');
  }

  const unauthorized = await fetch('http://localhost:3000/api/admin/eventos');
  if (unauthorized.status !== 401) throw new Error(`API administrativa sem sessão retornou HTTP ${unauthorized.status}.`);

  const invalidLogin = await login(adminLogin, 'senha-incorreta');
  if (invalidLogin.status !== 401) throw new Error(`Senha incorreta retornou HTTP ${invalidLogin.status}.`);

  const adminLoginResponse = await login(adminLogin, adminPassword);
  if (adminLoginResponse.status !== 200) throw new Error(`Login Admin retornou HTTP ${adminLoginResponse.status}.`);
  const adminCookie = cookieFrom(adminLoginResponse);
  const adminManager = await fetch('http://localhost:3000/gerenciadorEventos', { headers: { Cookie: adminCookie }, redirect: 'manual' });
  const adminSearch = await fetch('http://localhost:3000/pesquisar', { headers: { Cookie: adminCookie }, redirect: 'manual' });
  const adminApi = await fetch('http://localhost:3000/api/admin/eventos', { headers: { Cookie: adminCookie } });
  const managerHtml = await adminManager.text();
  if (adminManager.status !== 200 || !managerHtml.includes('Novo usuário') || adminSearch.status !== 200 || adminApi.status !== 200) {
    throw new Error('O perfil Admin não recebeu acesso ao Gerenciador, Pesquisa e API de eventos.');
  }
  const createUser = await fetch('http://localhost:3000/api/admin/usuarios', {
    method: 'POST',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: managedLogin, senha: managedPassword, tipo: 'User' }),
  });
  const duplicateUser = await fetch('http://localhost:3000/api/admin/usuarios', {
    method: 'POST',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: managedLogin, senha: managedPassword, tipo: 'User' }),
  });
  const [storedUsers] = await pool.query<(RowDataPacket & { senha: string; tipo: string })[]>(
    'SELECT senha, tipo FROM Usuario WHERE login = ?', [managedLogin],
  );
  if (createUser.status !== 201 || duplicateUser.status !== 409
    || storedUsers[0]?.senha !== managedPassword || storedUsers[0]?.tipo !== 'User') {
    throw new Error('O cadastro administrativo de usuário não foi salvo corretamente em texto puro ou não bloqueou duplicidade.');
  }

  const userLoginResponse = await login(userLogin, userPassword);
  if (userLoginResponse.status !== 200) throw new Error(`Login User retornou HTTP ${userLoginResponse.status}.`);
  const userCookie = cookieFrom(userLoginResponse);
  const userSearch = await fetch('http://localhost:3000/pesquisar', { headers: { Cookie: userCookie }, redirect: 'manual' });
  const userManager = await fetch('http://localhost:3000/gerenciadorEventos', { headers: { Cookie: userCookie }, redirect: 'manual' });
  const userAdminApi = await fetch('http://localhost:3000/api/admin/eventos', { headers: { Cookie: userCookie } });
  const userSearchApi = await fetch('http://localhost:3000/api/admin/ganhadores/eventos', { headers: { Cookie: userCookie } });
  const userCreateApi = await fetch('http://localhost:3000/api/admin/usuarios', {
    method: 'POST',
    headers: { Cookie: userCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: `bloqueado.${stamp}`, senha: managedPassword, tipo: 'User' }),
  });
  if (userSearch.status !== 200 || userManager.status < 300 || userManager.status >= 400
    || userAdminApi.status !== 403 || userSearchApi.status !== 200 || userCreateApi.status !== 403) {
    throw new Error('As permissões do perfil User não foram aplicadas corretamente.');
  }

  const publicRaffle = await fetch('http://localhost:3000/EventoPublico/sorteio/PUB0001');
  const publicWheel = await fetch('http://localhost:3000/EventoPublico/roleta/PUB0002');
  if (publicRaffle.status !== 200 || publicWheel.status !== 200) {
    throw new Error('As páginas públicas de Sorteio ou Roleta exigiram autenticação.');
  }

  const logout = await fetch('http://localhost:3000/api/auth/logout', {
    method: 'POST', headers: { Cookie: adminCookie }, redirect: 'manual',
  });
  if (logout.status !== 303 || !logout.headers.get('set-cookie')?.includes('Max-Age=0')) {
    throw new Error('O encerramento da sessão não removeu o cookie.');
  }

  console.log('Teste de autenticação concluído: Admin, User, bloqueios e páginas públicas validados.');
} finally {
  await pool.query('DELETE FROM Usuario WHERE login IN (?, ?, ?)', [adminLogin, userLogin, managedLogin]);
  await pool.end();
}
