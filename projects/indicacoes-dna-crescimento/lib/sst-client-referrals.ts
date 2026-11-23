import { type ResultSetHeader } from "mysql2/promise";

import { openMySqlConnection } from "@/lib/mysql";

const TABLE = "`rd_st_qc`.`indicacoessst`";

export type NewSstClientReferral = {
  partnerOrganizationId: string;
  partnerName: string;
  consultantName: string;
  customerName: string;
  customerDocument: string;
  contactName: string;
  phone: string;
  email?: string;
  employeeCount?: string;
  roles?: string;
  observations?: string;
};

export async function createPendingSstClientReferrals(rows: NewSstClientReferral[]) {
  const connection = await openMySqlConnection();
  let transactionOpen = false;
  try {
    await connection.beginTransaction();
    transactionOpen = true;
    const ids: number[] = [];
    for (const row of rows) {
      const [result] = await connection.execute<ResultSetHeader>(
        `
          INSERT INTO ${TABLE} (
            id_parceiro, id_parceiro_base, sigla_banco, nome_parceiro,
            operacao, tipo_Ecossistema, discriminator, consultora,
            nome_cliente, cnpj_cliente, nome_contato, telefone_contato,
            email_contato, quantidade_funcionarios, cargos, observacao,
            empresa_rd_id, status_integracao, mensagem_integracao
          ) VALUES (?, ?, 'Q', ?, 'Qualitycert', 'Na pratica', 'B2C', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recebida', ?)
        `,
        [
          row.partnerOrganizationId,
          row.partnerOrganizationId,
          row.partnerName,
          row.consultantName,
          row.customerName,
          row.customerDocument,
          row.contactName,
          row.phone,
          row.email || null,
          row.employeeCount || null,
          row.roles || null,
          row.observations || null,
          row.partnerOrganizationId,
          "Indicação B2C Na pratica recebida e aguardando processamento no RD Station.",
        ],
      );
      ids.push(result.insertId);
    }
    await connection.commit();
    transactionOpen = false;
    return ids;
  } catch (error) {
    if (transactionOpen) await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

export async function updateSstClientReferral(
  id: number,
  update: {
    status: "processando" | "sucesso" | "erro";
    message: string;
    contactId?: string;
    dealId?: string;
  },
) {
  const connection = await openMySqlConnection();
  try {
    await connection.execute(
      `
        UPDATE ${TABLE}
        SET status_integracao = ?, mensagem_integracao = ?,
            contato_rd_id = COALESCE(?, contato_rd_id),
            negociacao_rd_id = COALESCE(?, negociacao_rd_id)
        WHERE id = ?
      `,
      [
        update.status,
        update.message.slice(0, 5000),
        update.contactId ?? null,
        update.dealId ?? null,
        id,
      ],
    );
  } finally {
    await connection.end();
  }
}
