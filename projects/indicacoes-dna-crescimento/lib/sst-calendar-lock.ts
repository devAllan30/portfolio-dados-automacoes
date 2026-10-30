import { type ResultSetHeader } from "mysql2/promise";

import { openMySqlConnection } from "@/lib/mysql";

const LOCK_TABLE = "`rd_st_qc`.`agenda_reservas_sst`";

function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

export async function acquireSstCalendarLock(data: {
  responsibleId: string;
  date: string;
  time: string;
  source: string;
}) {
  const connection = await openMySqlConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `DELETE FROM ${LOCK_TABLE}
       WHERE expira_em IS NOT NULL AND expira_em <= NOW()`,
    );
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${LOCK_TABLE}
         (responsavel_id, data_hora, origem, confirmada, expira_em)
       VALUES (?, ?, ?, 0, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
      [data.responsibleId, `${data.date} ${data.time}:00`, data.source],
    );
    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (isDuplicateKey(error)) return null;
    throw error;
  } finally {
    await connection.end();
  }
}

export async function confirmSstCalendarLock(data: {
  lockId: number;
  referenceId: number;
  googleEventId: string;
}) {
  const connection = await openMySqlConnection();
  try {
    await connection.execute(
      `UPDATE ${LOCK_TABLE}
       SET confirmada = 1,
           expira_em = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
           referencia_id = ?,
           google_event_id = ?
       WHERE id = ?`,
      [data.referenceId, data.googleEventId, data.lockId],
    );
  } finally {
    await connection.end();
  }
}

export async function releaseSstCalendarLock(lockId: number) {
  const connection = await openMySqlConnection();
  try {
    await connection.execute(`DELETE FROM ${LOCK_TABLE} WHERE id = ?`, [lockId]);
  } finally {
    await connection.end();
  }
}
