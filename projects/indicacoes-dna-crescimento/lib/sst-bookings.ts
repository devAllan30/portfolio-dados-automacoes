import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { type GoogleReservation } from "@/lib/google-calendar";
import { openMySqlConnection } from "@/lib/mysql";

export const SST_ECOSYSTEM_TYPE = "Na pratica";
const SST_BOOKINGS_TABLE = "`rd_st_qc`.`indicacoessst`";

export type NewSstBooking = {
  consultantName: string;
  companyName: string;
  companyDealId: string;
  companyOrganizationId?: string;
  contactName: string;
  phone: string;
  primaryEmail: string;
  additionalEmails: string[];
  clientCount?: number;
  observations?: string;
  scheduledAt: string;
  closerId: string;
};

function combinedObservation(booking: NewSstBooking) {
  return [
    booking.observations?.trim() || "",
    booking.additionalEmails.length
      ? `E-mails adicionais: ${booking.additionalEmails.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function countMonthlySstBookings(
  closerIds: string[],
  dateReference: string,
) {
  const ids = [...new Set(closerIds.filter(Boolean))];
  if (!ids.length) return new Map<string, number>();
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateReference);
  if (!match) throw new Error("Data de referência inválida para distribuir a reunião.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const monthStart = `${match[1]}-${match[2]}-01 00:00:00`;
  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(
    nextMonthDate.getUTCMonth() + 1,
  ).padStart(2, "0")}-01 00:00:00`;
  const placeholders = ids.map(() => "?").join(", ");
  const connection = await openMySqlConnection();
  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT responsavel_reuniao_id, COUNT(*) AS total
        FROM ${SST_BOOKINGS_TABLE}
        WHERE discriminator = 'B2B'
          AND status_integracao <> 'erro'
          AND responsavel_reuniao_id IN (${placeholders})
          AND data_hora_reuniao >= ?
          AND data_hora_reuniao < ?
        GROUP BY responsavel_reuniao_id
      `,
      [...ids, monthStart, nextMonth],
    );
    const counts = new Map(ids.map((id) => [id, 0]));
    for (const row of rows) {
      counts.set(String(row.responsavel_reuniao_id), Number(row.total) || 0);
    }
    return counts;
  } finally {
    await connection.end();
  }
}

export async function createPendingSstBooking(booking: NewSstBooking) {
  const connection = await openMySqlConnection();
  try {
    const [result] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO ${SST_BOOKINGS_TABLE} (
          id_parceiro,
          id_parceiro_base,
          sigla_banco,
          nome_parceiro,
          operacao,
          tipo_Ecossistema,
          discriminator,
          consultora,
          nome_cliente,
          cnpj_cliente,
          nome_contato,
          telefone_contato,
          email_contato,
          quantidade_funcionarios,
          cargos,
          observacao,
          data_hora_reuniao,
          responsavel_reuniao_id,
          empresa_rd_id,
          negociacao_rd_id,
          status_integracao,
          mensagem_integracao
        ) VALUES (?, ?, 'Q', ?, 'Qualitycert', ?, 'B2B', ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'recebida', ?)
      `,
      [
        booking.companyDealId,
        booking.companyDealId,
        booking.companyName,
        SST_ECOSYSTEM_TYPE,
        booking.consultantName,
        booking.companyName,
        booking.contactName,
        booking.phone,
        booking.primaryEmail,
        booking.clientCount ? String(booking.clientCount) : null,
        combinedObservation(booking) || null,
        booking.scheduledAt,
        booking.closerId,
        booking.companyOrganizationId || null,
        booking.companyDealId,
        "Agendamento Na pratica recebido e aguardando processamento no RD e Google Agenda.",
      ],
    );
    return result.insertId;
  } finally {
    await connection.end();
  }
}

export async function confirmSstBooking(
  bookingId: number,
  reservation: GoogleReservation,
  rd: { taskId: string; dealId: string; contactId?: string },
) {
  const connection = await openMySqlConnection();
  try {
    await connection.execute(
      `
        UPDATE ${SST_BOOKINGS_TABLE}
        SET contato_rd_id = COALESCE(?, contato_rd_id),
            negociacao_rd_id = ?,
            id_tarefa_rd = ?,
            id_tarefa_google_agenda = ?,
            status_integracao = 'sucesso',
            mensagem_integracao = ?
        WHERE id = ?
      `,
      [
        rd.contactId ?? null,
        rd.dealId,
        rd.taskId,
        reservation.id,
        "Reunião Na pratica agendada no RD Station e no Google Agenda com sucesso.",
        bookingId,
      ],
    );
  } finally {
    await connection.end();
  }
}

export async function failSstBooking(bookingId: number, message: string) {
  const connection = await openMySqlConnection();
  try {
    await connection.execute(
      `
        UPDATE ${SST_BOOKINGS_TABLE}
        SET status_integracao = 'erro', mensagem_integracao = ?
        WHERE id = ?
      `,
      [message.slice(0, 5000), bookingId],
    );
  } finally {
    await connection.end();
  }
}
