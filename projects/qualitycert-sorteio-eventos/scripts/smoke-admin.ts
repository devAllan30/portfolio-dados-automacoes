import { join } from 'node:path';
import { config } from 'dotenv';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/mysql';
import { createSessionToken, SESSION_COOKIE } from '../lib/session';

config({ path: join(process.cwd(), '.env.local'), quiet: true });

const nativeFetch = globalThis.fetch;
const adminToken = createSessionToken({ userId: 0, login: 'teste-admin', tipo: 'Admin' });
globalThis.fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Cookie', `${SESSION_COOKIE}=${adminToken}`);
  return nativeFetch(input, { ...init, headers });
}) as typeof fetch;

const eventosBaseUrl = (process.env.EVENTOS_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const nomeEvento = `São Paulo Teste ${Date.now()}`;
const pool = getPool();
let eventoId = 0;
const rafflePrize = 'Certificado digital de teste';
const wheelAwardRule = 'Gire a Roleta e utilize o voucher para garantir seus certificados.';

try {
  const payload = {
    nomeEvento,
    prefixo: 'SAO',
    dataInicio: '2026-09-01',
    dataFinal: '2026-09-03',
  };
  const response = await fetch('http://localhost:3000/api/admin/eventos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json() as { eventoId?: number; message?: string };
  if (response.status !== 201 || !data.eventoId) {
    throw new Error(`Criação retornou HTTP ${response.status}: ${data.message ?? 'resposta inesperada'}`);
  }
  eventoId = data.eventoId;
  const [emptyEvent] = await pool.execute<(RowDataPacket & { total_interacoes: number; total_codigos: number })[]>(
    `SELECT COUNT(DISTINCT e.tipo_interacao) AS total_interacoes, COUNT(DISTINCT e.id) AS total_codigos
       FROM Eventos_label l
       LEFT JOIN Evento e ON e.evento_id = l.id
      WHERE l.id = ? GROUP BY l.id`, [eventoId],
  );
  if (Number(emptyEvent[0]?.total_interacoes) !== 0 || Number(emptyEvent[0]?.total_codigos) !== 0) {
    throw new Error('O evento foi criado com interação ou códigos antes do vínculo.');
  }

  const raffleResponse = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}/interacoes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interacao: 'sorteio', premio: rafflePrize, quantidade: 3 }),
  });
  const raffle = await raffleResponse.json() as { codigos?: { codigo: string; link: string }[]; message?: string };
  if (raffleResponse.status !== 201 || raffle.codigos?.length !== 3) {
    throw new Error(`Vínculo do Sorteio retornou HTTP ${raffleResponse.status}: ${raffle.message ?? 'resposta inesperada'}`);
  }
  if (!raffle.codigos.every(({ codigo, link }) => /^SAO\d{4}$/.test(codigo) && link.startsWith(`${eventosBaseUrl}/`) && link.includes(`/${encodeURIComponent(nomeEvento)}/sorteio/${codigo}`))) {
    throw new Error('Os códigos ou links não foram vinculados corretamente ao nome do evento.');
  }

  const duplicateRaffle = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}/interacoes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interacao: 'sorteio', premio: rafflePrize, quantidade: 3 }),
  });
  if (duplicateRaffle.status !== 409) throw new Error(`Sorteio duplicado retornou HTTP ${duplicateRaffle.status}.`);

  const invalidWheel = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}/interacoes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interacao: 'roleta', regraPremiacao: wheelAwardRule, lotes: [{ quantidadeCodigos: 2, quantidadeCertificados: 0 }] }),
  });
  if (invalidWheel.status !== 400) throw new Error(`Roleta sem certificados retornou HTTP ${invalidWheel.status}.`);

  const wheelResponse = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}/interacoes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interacao: 'roleta', regraPremiacao: wheelAwardRule, lotes: [{ quantidadeCodigos: 2, quantidadeCertificados: 25 }, { quantidadeCodigos: 1, quantidadeCertificados: 50 }] }),
  });
  const wheel = await wheelResponse.json() as { codigos?: { codigo: string; certificados: number; link: string }[]; message?: string };
  if (wheelResponse.status !== 201 || wheel.codigos?.length !== 3) {
    throw new Error(`Vínculo da Roleta retornou HTTP ${wheelResponse.status}: ${wheel.message ?? 'resposta inesperada'}`);
  }
  if (!wheel.codigos.every((item) => /^SAO\d{4}$/.test(item.codigo) && item.link.startsWith(`${eventosBaseUrl}/`) && item.link.includes(`/${encodeURIComponent(nomeEvento)}/roleta/${item.codigo}`))) {
    throw new Error('Os links públicos da Roleta não foram gerados corretamente.');
  }
  const publicWheelCode = await fetch(`http://localhost:3000/api/eventos/${eventoId}/roleta/${wheel.codigos[0].codigo}`);
  const publicWheelData = await publicWheelCode.json() as { regraPremiacao?: string };
  if (publicWheelCode.status !== 200 || publicWheelData.regraPremiacao !== wheelAwardRule) {
    throw new Error('A Regra Premiação não foi retornada para a tela da Roleta.');
  }

  const raffleExport = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}/interacoes?interacao=sorteio`);
  const raffleExportData = await raffleExport.json() as { codigos?: { codigo: string; link: string }[] };
  if (raffleExport.status !== 200 || raffleExportData.codigos?.length !== 3
    || !raffleExportData.codigos.every((item) => item.link.startsWith(`${eventosBaseUrl}/`) && item.link.includes(`/${encodeURIComponent(nomeEvento)}/sorteio/${item.codigo}`))) {
    throw new Error('A reexportação do Sorteio não retornou os links pelo nome do evento.');
  }

  const wheelExport = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}/interacoes?interacao=roleta`);
  const wheelExportData = await wheelExport.json() as { codigos?: { codigo: string; certificados: number; link: string }[] };
  if (wheelExport.status !== 200 || wheelExportData.codigos?.length !== 3
    || !wheelExportData.codigos.every((item) => item.certificados > 0 && item.link.startsWith(`${eventosBaseUrl}/`) && item.link.includes(`/${encodeURIComponent(nomeEvento)}/roleta/${item.codigo}`))) {
    throw new Error('A reexportação da Roleta não retornou códigos, certificados e links corretos.');
  }
  const [wheelRows] = await pool.execute<(RowDataPacket & { quantidade_certificados: number; total: number })[]>(
    `SELECT quantidade_certificados, COUNT(*) AS total
       FROM Evento
      WHERE evento_id = ? AND tipo_interacao = 'roleta'
      GROUP BY quantidade_certificados ORDER BY quantidade_certificados`, [eventoId],
  );
  if (wheelRows.length !== 2 || Number(wheelRows[0].quantidade_certificados) !== 25 || Number(wheelRows[0].total) !== 2
    || Number(wheelRows[1].quantidade_certificados) !== 50 || Number(wheelRows[1].total) !== 1) {
    throw new Error('Os lotes e certificados da Roleta não foram gravados corretamente em Evento.');
  }

  const duplicateWheel = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}/interacoes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interacao: 'roleta', regraPremiacao: wheelAwardRule, lotes: [{ quantidadeCodigos: 1, quantidadeCertificados: 10 }] }),
  });
  if (duplicateWheel.status !== 409) throw new Error(`Roleta duplicada retornou HTTP ${duplicateWheel.status}.`);

  const publicCode = await fetch(`http://localhost:3000/api/eventos/${eventoId}/${raffle.codigos[0].codigo}`);
  const publicData = await publicCode.json() as { premio?: string };
  if (publicCode.status !== 200 || publicData.premio !== rafflePrize) {
    throw new Error('O prêmio não foi retornado para a tela de participação.');
  }

  const disable = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: false }),
  });
  if (disable.status !== 200) throw new Error(`Desativação retornou HTTP ${disable.status}.`);
  const [inactiveRows] = await pool.execute<(RowDataPacket & { evento_ativo: number; codigos_ativos: number })[]>(
    `SELECT l.ativo AS evento_ativo, SUM(e.ativo) AS codigos_ativos
       FROM Eventos_label l INNER JOIN Evento e ON e.evento_id = l.id
      WHERE l.id = ? GROUP BY l.id`, [eventoId],
  );
  if (inactiveRows[0]?.evento_ativo !== 0 || Number(inactiveRows[0]?.codigos_ativos) !== 0) {
    throw new Error('A desativação não alcançou o evento e todos os códigos.');
  }

  const inactiveCode = await fetch(`http://localhost:3000/api/eventos/${eventoId}/${raffle.codigos[0].codigo}`);
  const inactiveData = await inactiveCode.json() as { status?: string };
  if (inactiveCode.status !== 403 || inactiveData.status !== 'inativo') {
    throw new Error('Um código inativo continuou disponível para participação.');
  }

  const enable = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: true }),
  });
  if (enable.status !== 200) throw new Error(`Reativação retornou HTTP ${enable.status}.`);

  const duplicate = await fetch('http://localhost:3000/api/admin/eventos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (duplicate.status !== 409) throw new Error(`Duplicidade retornou HTTP ${duplicate.status}.`);

  await pool.execute("UPDATE Eventos_label SET data_final = '2020-01-01', ativo = 1 WHERE id = ?", [eventoId]);
  await pool.execute('UPDATE Evento SET ativo = 1 WHERE evento_id = ?', [eventoId]);
  await fetch('http://localhost:3000/api/admin/eventos');
  const [expiredRows] = await pool.execute<(RowDataPacket & { evento_ativo: number; codigos_ativos: number })[]>(
    `SELECT l.ativo AS evento_ativo, SUM(e.ativo) AS codigos_ativos
       FROM Eventos_label l INNER JOIN Evento e ON e.evento_id = l.id
      WHERE l.id = ? GROUP BY l.id`, [eventoId],
  );
  if (expiredRows[0]?.evento_ativo !== 0 || Number(expiredRows[0]?.codigos_ativos) !== 0) {
    throw new Error('O vencimento automático não inativou o evento e os códigos.');
  }
  const expiredEnable = await fetch(`http://localhost:3000/api/admin/eventos/${eventoId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: true }),
  });
  if (expiredEnable.status !== 409) throw new Error(`Reativação de evento vencido retornou HTTP ${expiredEnable.status}.`);

  console.log('Teste do gerenciador concluído: ativação, códigos, vencimento e duplicidade validados.');
} finally {
  if (eventoId) {
    await pool.execute('DELETE FROM Evento WHERE evento_id = ?', [eventoId]);
    await pool.execute('DELETE FROM Eventos_label WHERE id = ?', [eventoId]);
  }
  await pool.end();
}
