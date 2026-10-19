import { type ResultSetHeader } from "mysql2/promise";

import { openMySqlConnection } from "@/lib/mysql";

type NewIndication = {
  consultant: string;
  indicatedName: string;
  phone: string;
  indicator: string;
  indicatorDealId: string;
  createdDealId: string;
  observations?: string;
};

export async function saveIndication(indication: NewIndication) {
  const connection = await openMySqlConnection();

  try {
    const [result] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO indicacoes (
          Consultor_responsavel,
          nome_indicado,
          telefone,
          indicador,
          id_deal_indicador,
          id_deal_indicacao,
          observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        indication.consultant,
        indication.indicatedName,
        indication.phone,
        indication.indicator,
        indication.indicatorDealId,
        indication.createdDealId,
        indication.observations || null,
      ],
    );

    return result.insertId;
  } finally {
    await connection.end();
  }
}
