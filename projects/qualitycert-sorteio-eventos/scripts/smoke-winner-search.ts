import { join } from 'node:path';
import { config } from 'dotenv';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/mysql';
import { createSessionToken, SESSION_COOKIE } from '../lib/session';

config({ path: join(process.cwd(), '.env.local'), quiet: true });

const nativeFetch = globalThis.fetch;
const userToken = createSessionToken({ userId: 0, login: 'teste-user', tipo: 'User' });
globalThis.fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Cookie', `${SESSION_COOKIE}=${userToken}`);
  return nativeFetch(input, { ...init, headers });
}) as typeof fetch;

const stamp = Date.now().toString().slice(-4);
const usedCode = `WIN${stamp}`;
const availableCode = `WIN${String(Number(stamp) + 1).padStart(4, '0').slice(-4)}`;
const eventName = `Evento Pesquisa ${stamp}`;
const pool = getPool();
let eventoId = 0;

try {
  const [eventResult] = await pool.execute<ResultSetHeader>(
    `INSERT INTO Eventos_label (nome_evento, prefixo, data_inicio, data_final, premio)
     VALUES (?, 'WIN', '2026-09-01', '2026-09-02', 'Prêmio da pesquisa')`,
    [eventName],
  );
  eventoId = eventResult.insertId;
  await pool.query(
    `INSERT INTO Evento
      (evento_id, codigo_sorteio, nome, telefone, email, cpf, contabilidade, cnpj, status, preenchido_em)
     VALUES
      (?, ?, 'Ganhador Teste', '(11) 99999-9999', 'ganhador@example.com', '52998224725', 'Contabilidade Teste', NULL, 'utilizado', UTC_TIMESTAMP()),
      (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'disponivel', NULL)`,
    [eventoId, usedCode, eventoId, availableCode],
  );

  const search = await fetch(`http://localhost:3000/api/admin/ganhadores?eventoId=${eventoId}&codigo=${usedCode.slice(0, 5)}`);
  const searchData = await search.json() as { codigos?: { codigo: string }[] };
  if (search.status !== 200 || !searchData.codigos?.some((item) => item.codigo === usedCode)) {
    throw new Error('O código utilizado não apareceu nas sugestões do evento.');
  }
  if (searchData.codigos.some((item) => item.codigo === availableCode)) {
    throw new Error('Um código disponível apareceu indevidamente nas sugestões.');
  }

  const detail = await fetch(`http://localhost:3000/api/admin/ganhadores/${usedCode}?eventoId=${eventoId}`);
  const detailData = await detail.json() as { nome?: string; eventoNome?: string };
  if (detail.status !== 200 || detailData.nome !== 'Ganhador Teste' || detailData.eventoNome !== eventName) {
    throw new Error('Os dados do ganhador não foram retornados corretamente.');
  }

  const selection = await fetch(`http://localhost:3000/api/admin/ganhadores/${usedCode}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventoId }),
  });
  if (selection.status !== 200) throw new Error(`Seleção do ganhador retornou HTTP ${selection.status}.`);
  const [savedWinner] = await pool.execute<(RowDataPacket & { ganhador: string; ganhador_codigo: string })[]>(
    'SELECT ganhador, ganhador_codigo FROM Eventos_label WHERE id = ?', [eventoId],
  );
  if (savedWinner[0]?.ganhador !== 'Ganhador Teste' || savedWinner[0]?.ganhador_codigo !== usedCode) {
    throw new Error('O ganhador não foi gravado em Eventos_label.');
  }

  console.log('Teste da pesquisa concluído: evento, código e registro do ganhador validados.');
} finally {
  if (eventoId) {
    await pool.execute('DELETE FROM Evento WHERE evento_id = ?', [eventoId]);
    await pool.execute('DELETE FROM Eventos_label WHERE id = ?', [eventoId]);
  }
  await pool.end();
}
