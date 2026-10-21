import { join } from 'node:path';
import { config } from 'dotenv';
import type { ResultSetHeader } from 'mysql2/promise';
import { getPool } from '../db/mysql';

config({ path: join(process.cwd(), '.env.local'), quiet: true });

const stamp = Date.now();
const sharedCode = `TES${String(stamp).slice(-4)}`;
const secondCode = `TES${String(stamp + 1).slice(-4)}`;
const pool = getPool();
const eventIds: number[] = [];

try {
  for (const name of [`Teste Técnico ${stamp}`, `Outro Evento ${stamp}`]) {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Eventos_label (nome_evento, prefixo, data_inicio, data_final, premio)
       VALUES (?, 'TES', '2026-09-01', '2026-09-02', 'Prêmio teste')`,
      [name],
    );
    eventIds.push(result.insertId);
  }

  await pool.query(
    `INSERT INTO Evento (evento_id, codigo_sorteio, status)
     VALUES (?, ?, 'disponivel'), (?, ?, 'disponivel'), (?, ?, 'disponivel')`,
    [eventIds[0], sharedCode, eventIds[0], secondCode, eventIds[1], sharedCode],
  );

  const body = { nome: 'Participante Teste', telefone: '(11) 99999-9999', email: 'teste@example.com', cpf: '529.982.247-25', contabilidade: 'Contabilidade Teste', cnpj: '' };
  const first = await fetch(`http://localhost:3000/api/eventos/${eventIds[0]}/${sharedCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (first.status !== 200) throw new Error(`Primeiro cadastro retornou HTTP ${first.status}.`);

  const sameEvent = await fetch(`http://localhost:3000/api/eventos/${eventIds[0]}/${secondCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const sameEventData = await sameEvent.json() as { code?: string };
  if (sameEvent.status !== 409 || sameEventData.code !== 'CPF_JA_CADASTRADO') {
    throw new Error(`CPF repetido no mesmo evento retornou HTTP ${sameEvent.status}.`);
  }

  const otherEvent = await fetch(`http://localhost:3000/api/eventos/${eventIds[1]}/${sharedCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (otherEvent.status !== 200) throw new Error(`Mesmo código/CPF em outro evento retornou HTTP ${otherEvent.status}.`);

  console.log('Teste MySQL concluído: chave composta por evento, CPF e participação validados.');
} finally {
  if (eventIds.length) {
    await pool.query(`DELETE FROM Evento WHERE evento_id IN (${eventIds.map(() => '?').join(',')})`, eventIds);
    await pool.query(`DELETE FROM Eventos_label WHERE id IN (${eventIds.map(() => '?').join(',')})`, eventIds);
  }
  await pool.end();
}
