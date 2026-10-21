import { join } from 'node:path';
import { config } from 'dotenv';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/mysql';

config({ path: join(process.cwd(), '.env.local'), quiet: true });

const stamp = Date.now().toString().slice(-8);
const eventName = `Evento Roleta ${stamp}`;
const firstCode = `ROL${stamp.slice(-4)}`;
const secondCode = `ROX${stamp.slice(-4)}`;
const awardRule = 'Apresente este voucher para garantir os certificados.';
const pool = getPool();
let eventoId = 0;

try {
  const [eventResult] = await pool.execute<ResultSetHeader>(
    `INSERT INTO Eventos_label (nome_evento, prefixo, data_inicio, data_final, regra_premiacao)
     VALUES (?, 'ROL', '2026-09-01', '2026-09-03', ?)`,
    [eventName, awardRule],
  );
  eventoId = eventResult.insertId;
  await pool.query(
    `INSERT INTO Evento
      (evento_id, tipo_interacao, codigo_sorteio, quantidade_certificados, status, ativo)
     VALUES
      (?, 'roleta', ?, 25, 'disponivel', 1),
      (?, 'roleta', ?, 50, 'disponivel', 1)`,
    [eventoId, firstCode, eventoId, secondCode],
  );

  const wrongInteraction = await fetch(`http://localhost:3000/api/eventos/${eventoId}/${firstCode}`);
  if (wrongInteraction.status !== 404) throw new Error(`Código de Roleta foi aceito como Sorteio: HTTP ${wrongInteraction.status}.`);

  const validation = await fetch(`http://localhost:3000/api/eventos/${eventoId}/roleta/${firstCode}`);
  const validationData = await validation.json() as { status?: string; quantidadeCertificados?: number; regraPremiacao?: string };
  if (validation.status !== 200 || validationData.status !== 'disponivel' || validationData.quantidadeCertificados !== 25 || validationData.regraPremiacao !== awardRule) {
    throw new Error('A validação da Roleta não retornou os 25 certificados esperados.');
  }

  const body = { nome: 'Participante Roleta', telefone: '(11) 99999-9999', email: 'roleta@example.com', cpf: '529.982.247-25', contabilidade: 'Contabilidade Roleta', cnpj: '' };
  const registration = await fetch(`http://localhost:3000/api/eventos/${eventoId}/roleta/${firstCode}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const registrationData = await registration.json() as { quantidadeCertificados?: number; message?: string };
  if (registration.status !== 200 || registrationData.quantidadeCertificados !== 25) {
    throw new Error(`Cadastro da Roleta retornou HTTP ${registration.status}: ${registrationData.message ?? 'resposta inesperada'}`);
  }

  const repeatedCpf = await fetch(`http://localhost:3000/api/eventos/${eventoId}/roleta/${secondCode}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (repeatedCpf.status !== 200) throw new Error(`CPF repetido na Roleta retornou HTTP ${repeatedCpf.status}.`);
  const [repeatedRows] = await pool.execute<(RowDataPacket & { total: number })[]>(
    "SELECT COUNT(*) AS total FROM Evento WHERE evento_id = ? AND tipo_interacao = 'roleta' AND cpf = '52998224725'",
    [eventoId],
  );
  if (Number(repeatedRows[0]?.total) !== 2) throw new Error('O mesmo CPF não foi mantido nos dois códigos da Roleta.');

  const used = await fetch(`http://localhost:3000/api/eventos/${eventoId}/roleta/${firstCode}`);
  const usedData = await used.json() as { status?: string; quantidadeCertificados?: number };
  if (used.status !== 200 || usedData.status !== 'utilizado' || usedData.quantidadeCertificados !== 25) {
    throw new Error('O código utilizado não manteve a quantidade de certificados.');
  }

  console.log('Teste da Roleta concluído: validação, certificados e repetição de CPF verificadas.');
} finally {
  if (eventoId) {
    await pool.execute('DELETE FROM Evento WHERE evento_id = ?', [eventoId]);
    await pool.execute('DELETE FROM Eventos_label WHERE id = ?', [eventoId]);
  }
  await pool.end();
}
