import { join } from 'node:path';
import { config } from 'dotenv';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/mysql';

config({ path: join(process.cwd(), '.env.local'), quiet: true });

const databaseName = process.env.RD_DB_NAME;
if (!databaseName) throw new Error('RD_DB_NAME não configurada.');

const pool = getPool();
try {
  const [rows] = await pool.execute<(RowDataPacket & {
    tabela: string;
    tipo: string;
    chave: string;
    extra: string;
  })[]>(
    `SELECT TABLE_NAME AS tabela, COLUMN_TYPE AS tipo, COLUMN_KEY AS chave, EXTRA AS extra
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name IN ('Eventos_label', 'Evento', 'Usuario')
        AND column_name = 'id'
      ORDER BY table_name`,
    [databaseName],
  );

  if (rows.length !== 3 || rows.some((row) => row.chave !== 'PRI' || !row.extra.includes('auto_increment'))) {
    throw new Error('As tabelas não possuem os IDs primários AUTO_INCREMENT esperados.');
  }

  console.log(`Banco ${databaseName} validado:`);
  for (const row of rows) {
    console.log(`- ${row.tabela}.id: ${row.tipo}, PRIMARY KEY, ${row.extra}`);
  }
} finally {
  await pool.end();
}
