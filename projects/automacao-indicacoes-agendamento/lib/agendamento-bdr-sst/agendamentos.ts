import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { abrirConexaoMySql } from "../banco-oauth-rd";

export async function registrarAgendamento(dados: {
  negociacaoId: string; empresaId?: string; responsavelId: string;
  emails: string[]; dataHora: Date; observacao?: string;
}) {
  const conexao = await abrirConexaoMySql();
  try {
    const [resultado] = await conexao.execute<ResultSetHeader>(`
      INSERT INTO agendamentos_bdr_sst
        (negociacao_rd_id, empresa_rd_id, responsavel_rd_id, emails_participantes_json,
         data_hora_reuniao, observacao, status_integracao)
      VALUES (?, ?, ?, ?, ?, ?, 'processando')
    `, [dados.negociacaoId, dados.empresaId ?? null, dados.responsavelId,
      JSON.stringify(dados.emails), dados.dataHora, dados.observacao || null]);
    return resultado.insertId;
  } finally { await conexao.end(); }
}

export async function atualizarAgendamento(id: number, dados: {
  status: "sucesso" | "erro"; mensagem: string; tarefaRdId?: string; eventoGoogleId?: string;
}) {
  const conexao = await abrirConexaoMySql();
  try {
    await conexao.execute(`UPDATE agendamentos_bdr_sst SET status_integracao = ?,
      mensagem_integracao = ?, tarefa_rd_id = COALESCE(?, tarefa_rd_id),
      evento_google_id = COALESCE(?, evento_google_id) WHERE id = ?`,
    [dados.status, dados.mensagem, dados.tarefaRdId ?? null, dados.eventoGoogleId ?? null, id]);
  } finally { await conexao.end(); }
}

export async function contarAgendamentosPorResponsavel(ids: string[], data: string) {
  if (ids.length === 0) return new Map<string, number>();
  const conexao = await abrirConexaoMySql();
  try {
    const marcadores = ids.map(() => "?").join(",");
    const [linhas] = await conexao.execute<(RowDataPacket & { responsavel_rd_id: string; total: number })[]>(`
      SELECT responsavel_rd_id, COUNT(*) total FROM agendamentos_bdr_sst
      WHERE responsavel_rd_id IN (${marcadores}) AND status_integracao <> 'erro'
        AND YEAR(data_hora_reuniao) = YEAR(?) AND MONTH(data_hora_reuniao) = MONTH(?)
      GROUP BY responsavel_rd_id`, [...ids, data, data]);
    return new Map(linhas.map((linha) => [linha.responsavel_rd_id, Number(linha.total)]));
  } finally { await conexao.end(); }
}
