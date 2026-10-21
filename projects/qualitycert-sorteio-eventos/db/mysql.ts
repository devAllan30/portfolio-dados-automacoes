import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { randomInt } from 'node:crypto';

const globalDatabase = globalThis as typeof globalThis & { rdQcPool?: Pool };

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

export function getPool() {
  if (!globalDatabase.rdQcPool) {
    globalDatabase.rdQcPool = mysql.createPool({
      host: requiredEnv('RD_DB_HOST'),
      port: Number(process.env.RD_DB_PORT || 3306),
      database: requiredEnv('RD_DB_NAME'),
      user: requiredEnv('RD_DB_USER'),
      password: requiredEnv('RD_DB_PASSWORD'),
      charset: 'utf8mb4',
      timezone: 'Z',
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
    });
  }
  return globalDatabase.rdQcPool;
}

function numericEventId(value: string) {
  return /^\d+$/.test(value) ? Number(value) : 0;
}

export function currentBrazilDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function syncExpiredEventos() {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE Eventos_label
          SET ativo = 0
        WHERE ativo = 1 AND data_final IS NOT NULL AND data_final < ?`,
      [currentBrazilDate()],
    );
    await connection.execute(
      `UPDATE Evento e
       INNER JOIN Eventos_label l ON l.id = e.evento_id
          SET e.ativo = 0
        WHERE l.ativo = 0 AND e.ativo = 1`,
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function findEventoByInteraction(codigo: string, eventKey: string, tipoInteracao: 'sorteio' | 'roleta') {
  await syncExpiredEventos();
  const [rows] = await getPool().execute<(RowDataPacket & {
    evento_id: number;
    evento_nome: string;
    prefixo: string;
    premio: string | null;
    regra_premiacao: string | null;
    quantidade_certificados: number | null;
    status: 'disponivel' | 'utilizado';
    evento_ativo: number;
    codigo_ativo: number;
  })[]>(
    `SELECT e.evento_id, l.nome_evento AS evento_nome, l.prefixo, l.premio, l.regra_premiacao,
            e.quantidade_certificados, e.status,
            l.ativo AS evento_ativo, e.ativo AS codigo_ativo
       FROM Evento e
       INNER JOIN Eventos_label l ON l.id = e.evento_id
      WHERE e.codigo_sorteio = ?
        AND e.tipo_interacao = ?
        AND (l.id = ? OR l.nome_evento = ?)
      LIMIT 1`,
    [codigo, tipoInteracao, numericEventId(eventKey), eventKey],
  );
  return rows[0] ?? null;
}

export function findEvento(codigo: string, eventKey: string) {
  return findEventoByInteraction(codigo, eventKey, 'sorteio');
}

export function findEventoRoleta(codigo: string, eventKey: string) {
  return findEventoByInteraction(codigo, eventKey, 'roleta');
}

export async function cpfAlreadyRegistered(eventoId: number, cpf: string) {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT id FROM Evento WHERE evento_id = ? AND tipo_interacao = 'sorteio' AND cpf = ? LIMIT 1",
    [eventoId, cpf],
  );
  return rows.length > 0;
}

export async function registerParticipation(input: {
  eventoId: number;
  codigo: string;
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  contabilidade: string;
  cnpj: string | null;
  urlOrigem: string;
  tipoInteracao?: 'sorteio' | 'roleta';
}) {
  const [result] = await getPool().execute<ResultSetHeader>(
    `UPDATE Evento
        SET nome = ?, telefone = ?, email = ?, cpf = ?, contabilidade = ?, cnpj = ?,
            url_origem = ?, status = 'utilizado', preenchido_em = UTC_TIMESTAMP()
      WHERE evento_id = ? AND tipo_interacao = ?
        AND codigo_sorteio = ? AND status = 'disponivel' AND ativo = 1`,
    [input.nome, input.telefone, input.email, input.cpf, input.contabilidade, input.cnpj,
      input.urlOrigem, input.eventoId, input.tipoInteracao ?? 'sorteio', input.codigo],
  );
  return result.affectedRows === 1;
}

export class EventoJaExisteError extends Error {
  constructor() {
    super('Já existe um evento com este nome.');
    this.name = 'EventoJaExisteError';
  }
}

function generateRaffleCode() {
  return randomInt(0, 10_000).toString().padStart(4, '0');
}

function generateUniqueCodes(prefixo: string, quantidade: number, existingCodes: Iterable<string> = []) {
  const usedCodes = new Set(existingCodes);
  const occupiedNumericCodes = [...usedCodes].filter((code) => (
    code.startsWith(prefixo)
    && code.length === prefixo.length + 4
    && /^\d{4}$/.test(code.slice(prefixo.length))
  )).length;
  const availableCodes = 10_000 - occupiedNumericCodes;
  if (quantidade > availableCodes) {
    throw new CodigosEsgotadosError();
  }

  const codes: string[] = [];
  while (codes.length < quantidade) {
    const code = `${prefixo}${generateRaffleCode()}`;
    if (usedCodes.has(code)) continue;
    usedCodes.add(code);
    codes.push(code);
  }
  return codes;
}

export class CodigosEsgotadosError extends Error {
  constructor() {
    super('Não há combinações numéricas de quatro dígitos suficientes disponíveis para este evento.');
    this.name = 'CodigosEsgotadosError';
  }
}

export function raffleCodePrefix(eventoNome: string) {
  return eventoNome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 3)
    .toUpperCase();
}

export async function createEvento(input: {
  eventoNome: string;
  prefixo: string;
  dataInicio: string;
  dataFinal: string;
}) {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [eventResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO Eventos_label
        (nome_evento, prefixo, data_inicio, data_final)
       VALUES (?, ?, ?, ?)`,
      [input.eventoNome, input.prefixo, input.dataInicio, input.dataFinal],
    );
    const eventoId = eventResult.insertId;
    await connection.commit();
    return { eventoId };
  } catch (error) {
    await connection.rollback();
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      throw new EventoJaExisteError();
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function addSorteioAoEvento(input: { eventoId: number; quantidade: number; premio: string }) {
  await syncExpiredEventos();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & { nome_evento: string; prefixo: string; ativo: number })[]>(
      'SELECT nome_evento, prefixo, ativo FROM Eventos_label WHERE id = ? LIMIT 1 FOR UPDATE',
      [input.eventoId],
    );
    if (!rows.length) {
      await connection.rollback();
      return { status: 'nao_encontrado' as const };
    }
    if (!rows[0].ativo) {
      await connection.rollback();
      return { status: 'inativo' as const };
    }
    const [interactions] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM Evento WHERE evento_id = ? AND tipo_interacao = 'sorteio' LIMIT 1 FOR UPDATE",
      [input.eventoId],
    );
    if (interactions.length) {
      await connection.rollback();
      return { status: 'ja_vinculado' as const };
    }

    const [existingRows] = await connection.execute<(RowDataPacket & { codigo_sorteio: string })[]>(
      'SELECT codigo_sorteio FROM Evento WHERE evento_id = ? FOR UPDATE',
      [input.eventoId],
    );
    const codigos = generateUniqueCodes(rows[0].prefixo, input.quantidade, existingRows.map((row) => row.codigo_sorteio));
    await connection.execute('UPDATE Eventos_label SET premio = ? WHERE id = ?', [input.premio, input.eventoId]);
    for (let start = 0; start < codigos.length; start += 500) {
      const chunk = codigos.slice(start, start + 500);
      const placeholders = chunk.map(() => '(?, ?, \'disponivel\', 1)').join(', ');
      const values = chunk.flatMap((codigo) => [input.eventoId, codigo]);
      await connection.query(
        `INSERT INTO Evento (evento_id, codigo_sorteio, status, ativo) VALUES ${placeholders}`,
        values,
      );
    }
    await connection.commit();
    return { status: 'vinculado' as const, codigos, prefixo: rows[0].prefixo, eventoNome: rows[0].nome_evento };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function addRoletaAoEvento(input: {
  eventoId: number;
  regraPremiacao: string;
  lotes: { quantidadeCodigos: number; quantidadeCertificados: number }[];
}) {
  await syncExpiredEventos();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & { nome_evento: string; prefixo: string; ativo: number })[]>(
      'SELECT nome_evento, prefixo, ativo FROM Eventos_label WHERE id = ? LIMIT 1 FOR UPDATE',
      [input.eventoId],
    );
    if (!rows.length) {
      await connection.rollback();
      return { status: 'nao_encontrado' as const };
    }
    if (!rows[0].ativo) {
      await connection.rollback();
      return { status: 'inativo' as const };
    }
    const [interactions] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM Evento WHERE evento_id = ? AND tipo_interacao = 'roleta' LIMIT 1 FOR UPDATE",
      [input.eventoId],
    );
    if (interactions.length) {
      await connection.rollback();
      return { status: 'ja_vinculado' as const };
    }

    const [existingRows] = await connection.execute<(RowDataPacket & { codigo_sorteio: string })[]>(
      'SELECT codigo_sorteio FROM Evento WHERE evento_id = ? FOR UPDATE',
      [input.eventoId],
    );
    const totalCodes = input.lotes.reduce((total, lote) => total + lote.quantidadeCodigos, 0);
    const numericCodes = generateUniqueCodes(rows[0].prefixo, totalCodes, existingRows.map((row) => row.codigo_sorteio));
    let codeIndex = 0;
    const codigos = input.lotes.flatMap((lote) => Array.from({ length: lote.quantidadeCodigos }, () => ({
      codigo: numericCodes[codeIndex++],
      quantidadeCertificados: lote.quantidadeCertificados,
    })));

    await connection.execute(
      'UPDATE Eventos_label SET regra_premiacao = ? WHERE id = ?',
      [input.regraPremiacao, input.eventoId],
    );
    for (let start = 0; start < codigos.length; start += 500) {
      const chunk = codigos.slice(start, start + 500);
      const placeholders = chunk.map(() => "(?, ?, ?, 'roleta', 1)").join(', ');
      const values = chunk.flatMap((item) => [input.eventoId, item.codigo, item.quantidadeCertificados]);
      await connection.query(
        `INSERT INTO Evento
          (evento_id, codigo_sorteio, quantidade_certificados, tipo_interacao, ativo)
         VALUES ${placeholders}`,
        values,
      );
    }
    await connection.commit();
    return { status: 'vinculado' as const, codigos, prefixo: rows[0].prefixo, eventoNome: rows[0].nome_evento };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listInteractionCodes(eventoId: number, tipoInteracao: 'sorteio' | 'roleta') {
  const [rows] = await getPool().execute<(RowDataPacket & {
    evento_nome: string;
    prefixo: string;
    codigo_sorteio: string;
    quantidade_certificados: number | null;
  })[]>(
    `SELECT l.nome_evento AS evento_nome, l.prefixo, e.codigo_sorteio, e.quantidade_certificados
       FROM Evento e
       INNER JOIN Eventos_label l ON l.id = e.evento_id
      WHERE e.evento_id = ? AND e.tipo_interacao = ?
      ORDER BY e.id`,
    [eventoId, tipoInteracao],
  );
  return rows;
}

export async function listEventos() {
  await syncExpiredEventos();
  const [rows] = await getPool().query<(RowDataPacket & {
    id: number;
    nome_evento: string;
    prefixo: string;
    data_criacao: Date;
    data_inicio: string | null;
    data_final: string | null;
    premio: string | null;
    tipo_interacao: string;
    ativo: number;
    ganhador: string | null;
    ganhador_codigo: string | null;
    total_codigos: number;
    total_utilizados: number;
  })[]>(
    `SELECT l.id, l.nome_evento, l.prefixo, l.data_criacao, l.data_inicio, l.data_final,
            l.premio, COALESCE(GROUP_CONCAT(DISTINCT e.tipo_interacao ORDER BY e.tipo_interacao SEPARATOR ','), '') AS tipo_interacao,
            l.ativo, l.ganhador, l.ganhador_codigo,
            SUM(CASE WHEN e.tipo_interacao = 'sorteio' THEN 1 ELSE 0 END) AS total_codigos,
            SUM(CASE WHEN e.tipo_interacao = 'sorteio' AND e.status = 'utilizado' THEN 1 ELSE 0 END) AS total_utilizados
       FROM Eventos_label l
       LEFT JOIN Evento e ON e.evento_id = l.id
      GROUP BY l.id
      ORDER BY l.data_criacao DESC, l.id DESC`,
  );
  return rows;
}

export async function listDashboardEventos() {
  await syncExpiredEventos();
  const [rows] = await getPool().query<(RowDataPacket & {
    id: number;
    nome_evento: string;
    prefixo: string;
    ativo: number;
    data_inicio: string | null;
    data_final: string | null;
    tipo_interacao: string;
  })[]>(
    `SELECT l.id, l.nome_evento, l.prefixo, l.ativo, l.data_inicio, l.data_final,
            COALESCE(GROUP_CONCAT(DISTINCT e.tipo_interacao ORDER BY e.tipo_interacao SEPARATOR ','), '') AS tipo_interacao
       FROM Eventos_label l
       LEFT JOIN Evento e ON e.evento_id = l.id
      GROUP BY l.id
      ORDER BY l.data_criacao DESC, l.id DESC`,
  );
  return rows;
}

export async function getDashboardEvento(eventoId: number) {
  await syncExpiredEventos();
  const [eventRows] = await getPool().execute<(RowDataPacket & {
    id: number;
    nome_evento: string;
    prefixo: string;
    ativo: number;
    data_inicio: string | null;
    data_final: string | null;
  })[]>(
    'SELECT id, nome_evento, prefixo, ativo, data_inicio, data_final FROM Eventos_label WHERE id = ? LIMIT 1',
    [eventoId],
  );
  if (!eventRows.length) return null;

  const [raffleRows] = await getPool().execute<(RowDataPacket & {
    total: number;
    utilizados: number;
    disponiveis: number;
  })[]>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'utilizado' THEN 1 ELSE 0 END) AS utilizados,
            SUM(CASE WHEN status = 'disponivel' THEN 1 ELSE 0 END) AS disponiveis
       FROM Evento
      WHERE evento_id = ? AND tipo_interacao = 'sorteio'`,
    [eventoId],
  );
  const [wheelRows] = await getPool().execute<(RowDataPacket & {
    quantidade_certificados: number;
    total: number;
    utilizados: number;
    disponiveis: number;
  })[]>(
    `SELECT quantidade_certificados, COUNT(*) AS total,
            SUM(CASE WHEN status = 'utilizado' THEN 1 ELSE 0 END) AS utilizados,
            SUM(CASE WHEN status = 'disponivel' THEN 1 ELSE 0 END) AS disponiveis
       FROM Evento
      WHERE evento_id = ? AND tipo_interacao = 'roleta'
      GROUP BY quantidade_certificados
      ORDER BY quantidade_certificados`,
    [eventoId],
  );
  return { evento: eventRows[0], sorteio: raffleRows[0], roleta: wheelRows };
}

export async function listDashboardParticipantes(input: {
  eventoId: number;
  interacao: 'sorteio' | 'roleta';
  nome: string;
  quantidadeCertificados?: number;
}) {
  const filters = [
    'e.evento_id = ?',
    'e.tipo_interacao = ?',
    "e.status = 'utilizado'",
    'e.nome IS NOT NULL',
  ];
  const values: (string | number)[] = [input.eventoId, input.interacao];
  if (input.nome) {
    filters.push('e.nome LIKE ?');
    values.push(`%${input.nome}%`);
  }
  if (input.interacao === 'roleta' && input.quantidadeCertificados !== undefined) {
    filters.push('e.quantidade_certificados = ?');
    values.push(input.quantidadeCertificados);
  }
  const where = filters.join(' AND ');
  const [countRows] = await getPool().execute<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM Evento e WHERE ${where}`,
    values,
  );
  const [rows] = await getPool().execute<(RowDataPacket & {
    id: number;
    codigo_sorteio: string;
    quantidade_certificados: number | null;
    nome: string;
    telefone: string;
    email: string;
    cpf: string;
    contabilidade: string;
    cnpj: string | null;
    preenchido_em: Date | null;
  })[]>(
    `SELECT e.id, e.codigo_sorteio, e.quantidade_certificados, e.nome, e.telefone,
            e.email, e.cpf, e.contabilidade, e.cnpj, e.preenchido_em
       FROM Evento e
      WHERE ${where}
      ORDER BY e.preenchido_em DESC, e.id DESC
      LIMIT 200`,
    values,
  );
  return { total: Number(countRows[0]?.total ?? 0), rows };
}

export async function setEventoAtivo(eventoId: number, ativo: boolean) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & { data_final: string | Date | null })[]>(
      'SELECT data_final FROM Eventos_label WHERE id = ? LIMIT 1 FOR UPDATE',
      [eventoId],
    );
    if (!rows.length) {
      await connection.rollback();
      return { status: 'nao_encontrado' as const };
    }
    const finalDate = rows[0].data_final instanceof Date
      ? rows[0].data_final.toISOString().slice(0, 10)
      : rows[0].data_final?.toString().slice(0, 10) ?? null;
    if (ativo && finalDate && finalDate < currentBrazilDate()) {
      await connection.rollback();
      return { status: 'expirado' as const };
    }
    await connection.execute('UPDATE Eventos_label SET ativo = ? WHERE id = ?', [ativo ? 1 : 0, eventoId]);
    await connection.execute('UPDATE Evento SET ativo = ? WHERE evento_id = ?', [ativo ? 1 : 0, eventoId]);
    await connection.commit();
    return { status: 'atualizado' as const, ativo };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function searchUsedRaffleCodes(eventoId: number, codeStart: string) {
  const [rows] = await getPool().execute<(RowDataPacket & { codigo_sorteio: string })[]>(
    `SELECT codigo_sorteio
       FROM Evento
      WHERE evento_id = ? AND tipo_interacao = 'sorteio' AND status = 'utilizado'
        AND codigo_sorteio LIKE CONCAT(?, '%')
      ORDER BY codigo_sorteio
      LIMIT 20`,
    [eventoId, codeStart],
  );
  return rows;
}

export async function findWinner(eventoId: number, codigo: string) {
  const [rows] = await getPool().execute<(RowDataPacket & {
    evento_id: number;
    evento_nome: string;
    codigo_sorteio: string;
    nome: string;
    telefone: string;
    email: string;
    cpf: string;
    contabilidade: string;
    cnpj: string | null;
    preenchido_em: Date | null;
  })[]>(
    `SELECT e.evento_id, l.nome_evento AS evento_nome, e.codigo_sorteio, e.nome,
            e.telefone, e.email, e.cpf, e.contabilidade, e.cnpj, e.preenchido_em
       FROM Evento e
       INNER JOIN Eventos_label l ON l.id = e.evento_id
      WHERE e.evento_id = ? AND e.tipo_interacao = 'sorteio'
        AND e.codigo_sorteio = ? AND e.status = 'utilizado'
      LIMIT 1`,
    [eventoId, codigo],
  );
  return rows[0] ?? null;
}

export async function selectWinner(eventoId: number, codigo: string) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [eventRows] = await connection.execute<(RowDataPacket & { ganhador: string | null })[]>(
      'SELECT ganhador FROM Eventos_label WHERE id = ? LIMIT 1 FOR UPDATE',
      [eventoId],
    );
    if (!eventRows.length) {
      await connection.rollback();
      return { status: 'evento_invalido' as const };
    }
    if (eventRows[0].ganhador) {
      await connection.rollback();
      return { status: 'ja_selecionado' as const };
    }

    const [winnerRows] = await connection.execute<(RowDataPacket & { nome: string })[]>(
      `SELECT nome FROM Evento
        WHERE evento_id = ? AND tipo_interacao = 'sorteio'
          AND codigo_sorteio = ? AND status = 'utilizado'
        LIMIT 1 FOR UPDATE`,
      [eventoId, codigo],
    );
    if (!winnerRows.length) {
      await connection.rollback();
      return { status: 'codigo_invalido' as const };
    }

    await connection.execute(
      `UPDATE Eventos_label
          SET ganhador = ?, ganhador_codigo = ?, ganhador_em = UTC_TIMESTAMP()
        WHERE id = ?`,
      [winnerRows[0].nome, codigo, eventoId],
    );
    await connection.commit();
    return { status: 'selecionado' as const, nome: winnerRows[0].nome };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
