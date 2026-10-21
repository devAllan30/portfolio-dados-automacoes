import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import type { RowDataPacket } from 'mysql2/promise';
import { currentBrazilDate, getPool, raffleCodePrefix } from '../db/mysql';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = join(currentDirectory, '..');
config({ path: join(projectDirectory, '.env.local'), quiet: true });
const schema = await readFile(join(projectDirectory, 'db', 'mysql-schema.sql'), 'utf8');

try {
  const pool = getPool();
  const databaseName = process.env.RD_DB_NAME;
  if (!databaseName) throw new Error('RD_DB_NAME não configurada.');
  const schemaName = databaseName;

  for (const statement of schema.split(';').map((item) => item.trim()).filter(Boolean)) {
    await pool.query(statement);
  }

  async function columnExists(tableName: string, columnName: string) {
    const [rows] = await pool.execute<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
      [schemaName, tableName, columnName],
    );
    return rows[0].total > 0;
  }

  async function tableExists(tableName: string) {
    const [rows] = await pool.execute<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM information_schema.tables
        WHERE table_schema = ? AND table_name = ?`,
      [schemaName, tableName],
    );
    return rows[0].total > 0;
  }

  async function ensureAutoIncrementId(tableName: 'Eventos_label' | 'Evento' | 'Usuario') {
    const [rows] = await pool.execute<(RowDataPacket & { column_extra: string })[]>(
      `SELECT EXTRA AS column_extra
         FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ? AND column_name = 'id'
        LIMIT 1`,
      [schemaName, tableName],
    );
    if (!rows.length) {
      await pool.query(`ALTER TABLE ${tableName} ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST`);
      return;
    }
    if (!rows[0].column_extra.toLowerCase().includes('auto_increment')) {
      await pool.query(`ALTER TABLE ${tableName} MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`);
    }
  }

  async function indexExists(indexName: string, tableName = 'Evento') {
    const [rows] = await pool.execute<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
      [schemaName, tableName, indexName],
    );
    return rows[0].total > 0;
  }

  async function foreignKeyExists(constraintName: string) {
    const [rows] = await pool.execute<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM information_schema.table_constraints
        WHERE constraint_schema = ? AND table_name = 'Evento'
          AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'`,
      [schemaName, constraintName],
    );
    return rows[0].total > 0;
  }

  if (!await columnExists('Eventos_label', 'ativo')) {
    await pool.query('ALTER TABLE Eventos_label ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER data_final');
  }
  if (!await columnExists('Eventos_label', 'premio')) {
    await pool.query('ALTER TABLE Eventos_label ADD COLUMN premio VARCHAR(255) NULL AFTER data_final');
  }
  if (!await columnExists('Eventos_label', 'regra_premiacao')) {
    await pool.query('ALTER TABLE Eventos_label ADD COLUMN regra_premiacao TEXT NULL AFTER premio');
  }
  if (!await indexExists('idx_eventos_label_ativo_periodo', 'Eventos_label')) {
    await pool.query('ALTER TABLE Eventos_label ADD KEY idx_eventos_label_ativo_periodo (ativo, data_final)');
  }

  const hasLegacyEventName = await columnExists('Evento', 'evento_nome');
  if (hasLegacyEventName) {
    const [legacyEvents] = await pool.query<(RowDataPacket & { evento_nome: string; criado_em: Date })[]>(
      `SELECT evento_nome, MIN(criado_em) AS criado_em
         FROM Evento
        GROUP BY evento_nome`,
    );

    for (const legacy of legacyEvents) {
      const prefixo = raffleCodePrefix(legacy.evento_nome).padEnd(3, 'X');
      await pool.execute(
        `INSERT INTO Eventos_label (nome_evento, prefixo, data_criacao)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE nome_evento = VALUES(nome_evento)`,
        [legacy.evento_nome, prefixo, legacy.criado_em],
      );
    }

    if (!await columnExists('Evento', 'evento_id')) {
      await pool.query('ALTER TABLE Evento ADD COLUMN evento_id BIGINT UNSIGNED NULL AFTER id');
    }

    await pool.query(
      `UPDATE Evento e
       INNER JOIN Eventos_label l ON l.nome_evento = e.evento_nome
          SET e.evento_id = l.id
        WHERE e.evento_id IS NULL`,
    );
  }

  const hasOldInteraction = await columnExists('Eventos_label', 'tipo_interacao');
  if (await tableExists('Evento_interacao')) {
    await pool.query(
      `UPDATE Eventos_label l
       INNER JOIN Evento_interacao i ON i.evento_id = l.id AND i.tipo_interacao = 'sorteio'
          SET l.premio = COALESCE(l.premio, i.premio)`,
    );
    await pool.query('DROP TABLE Evento_interacao');
  }
  if (hasOldInteraction) await pool.query('ALTER TABLE Eventos_label DROP COLUMN tipo_interacao');

  if (!await columnExists('Evento', 'ativo')) {
    await pool.query('ALTER TABLE Evento ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER evento_id');
  }
  if (!await columnExists('Evento', 'tipo_interacao')) {
    await pool.query("ALTER TABLE Evento ADD COLUMN tipo_interacao ENUM('sorteio', 'roleta') NOT NULL DEFAULT 'sorteio' AFTER ativo");
  }
  if (!await columnExists('Evento', 'quantidade_certificados')) {
    await pool.query('ALTER TABLE Evento ADD COLUMN quantidade_certificados INT UNSIGNED NULL AFTER codigo_sorteio');
  }
  if (!await columnExists('Evento', 'cpf_sorteio')) {
    await pool.query("ALTER TABLE Evento ADD COLUMN cpf_sorteio CHAR(11) GENERATED ALWAYS AS (CASE WHEN tipo_interacao = 'sorteio' THEN cpf ELSE NULL END) STORED AFTER cpf");
  }

  const [missingLinks] = await pool.query<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) AS total FROM Evento WHERE evento_id IS NULL',
  );
  if (missingLinks[0].total > 0) {
    throw new Error('Existem códigos sem vínculo com Eventos_label. A migração foi interrompida.');
  }

  if (!await indexExists('idx_evento_codigo_composto')) {
    await pool.query('ALTER TABLE Evento ADD UNIQUE KEY idx_evento_codigo_composto (evento_id, codigo_sorteio)');
  }
  if (await indexExists('idx_evento_id_cpf_unique')) await pool.query('ALTER TABLE Evento DROP INDEX idx_evento_id_cpf_unique');
  if (!await indexExists('idx_evento_id_cpf_sorteio_unique')) {
    await pool.query('ALTER TABLE Evento ADD UNIQUE KEY idx_evento_id_cpf_sorteio_unique (evento_id, cpf_sorteio)');
  }
  if (!await indexExists('idx_evento_id_status')) {
    await pool.query('ALTER TABLE Evento ADD KEY idx_evento_id_status (evento_id, status)');
  }

  for (const oldIndex of ['idx_evento_codigo_sorteio', 'idx_evento_nome_cpf_unique', 'idx_evento_nome_status']) {
    if (await indexExists(oldIndex)) await pool.query(`ALTER TABLE Evento DROP INDEX ${oldIndex}`);
  }

  await pool.query('ALTER TABLE Evento MODIFY evento_id BIGINT UNSIGNED NOT NULL');
  if (!await foreignKeyExists('fk_evento_label')) {
    await pool.query(
      'ALTER TABLE Evento ADD CONSTRAINT fk_evento_label FOREIGN KEY (evento_id) REFERENCES Eventos_label (id) ON UPDATE CASCADE ON DELETE RESTRICT',
    );
  }
  if (hasLegacyEventName) await pool.query('ALTER TABLE Evento DROP COLUMN evento_nome');

  for (const tableName of ['Eventos_label', 'Evento', 'Usuario'] as const) {
    await ensureAutoIncrementId(tableName);
  }

  await pool.execute(
    `UPDATE Eventos_label
        SET ativo = 0
      WHERE ativo = 1 AND data_final IS NOT NULL AND data_final < ?`,
    [currentBrazilDate()],
  );
  await pool.query(
    `UPDATE Evento e
       INNER JOIN Eventos_label l ON l.id = e.evento_id
          SET e.ativo = 0
        WHERE l.ativo = 0 AND e.ativo = 1`,
  );
  console.log('Tabelas Eventos_label, Evento e Usuario verificadas com IDs AUTO_INCREMENT.');
} finally {
  await getPool().end();
}
