import { join } from 'node:path';
import { config } from 'dotenv';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/mysql';

config({ path: join(process.cwd(), '.env.local'), quiet: true });

const connection = await getPool().getConnection();

try {
  await connection.beginTransaction();

  const [before] = await connection.execute<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) AS total FROM Evento WHERE codigo_sorteio LIKE ?',
    ['QC-%'],
  );

  const [collisions] = await connection.execute<RowDataPacket[]>(
    `SELECT prefixed.codigo_sorteio
       FROM Evento AS prefixed
       JOIN Evento AS existing
         ON existing.codigo_sorteio = SUBSTRING(prefixed.codigo_sorteio, 4)
        AND existing.id <> prefixed.id
      WHERE prefixed.codigo_sorteio LIKE ?
      LIMIT 1`,
    ['QC-%'],
  );

  if (collisions.length > 0) {
    throw new Error('A remoção criaria um código duplicado. Nenhum registro foi alterado.');
  }

  const [result] = await connection.execute<ResultSetHeader>(
    'UPDATE Evento SET codigo_sorteio = SUBSTRING(codigo_sorteio, 4) WHERE codigo_sorteio LIKE ?',
    ['QC-%'],
  );

  const [after] = await connection.execute<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) AS total FROM Evento WHERE codigo_sorteio LIKE ?',
    ['QC-%'],
  );

  if (after[0].total !== 0) throw new Error('Ainda existem códigos com o prefixo QC-.');

  await connection.commit();
  console.log(`Códigos encontrados: ${before[0].total}. Códigos atualizados: ${result.affectedRows}. Restantes com QC-: ${after[0].total}.`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await getPool().end();
}
