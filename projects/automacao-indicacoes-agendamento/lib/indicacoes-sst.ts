import {
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { abrirConexaoMySql } from "./banco-oauth-rd";

export type NovaIndicacaoSst = {
  idParceiro: string;
  idParceiroBase: string;
  siglaBanco: "D" | "Q";
  nomeParceiro: string;
  operacao: "Operação D" | "Operação Q";
  discriminator?: string;
  consultora: string;
  nomeCliente: string;
  cnpjCliente: string;
  nomeContato: string;
  telefoneContato: string;
  emailContato?: string;
  quantidadeFuncionarios?: string;
  cargos?: string;
  observacao?: string;
  dataHoraReuniao?: string;
  responsavelReuniaoId?: string;
};

export type AtualizacaoIndicacaoSst = {
  status: "recebida" | "processando" | "sucesso" | "erro";
  mensagem?: string | null;
  empresaRdId?: string | null;
  contatoRdId?: string | null;
  negociacaoRdId?: string | null;
};

async function inserirIndicacao(
  conexao: Connection,
  dados: NovaIndicacaoSst,
) {
  const [resultado] = await conexao.execute<ResultSetHeader>(
      `
        INSERT INTO indicacoessst (
          id_parceiro,
          id_parceiro_base,
          sigla_banco,
          nome_parceiro,
          operacao,
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
          status_integracao,
          mensagem_integracao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recebida', ?)
      `,
      [
        dados.idParceiro,
        dados.idParceiroBase,
        dados.siglaBanco,
        dados.nomeParceiro,
        dados.operacao,
        dados.discriminator || null,
        dados.consultora,
        dados.nomeCliente,
        dados.cnpjCliente,
        dados.nomeContato,
        dados.telefoneContato,
        dados.emailContato || null,
        dados.quantidadeFuncionarios || null,
        dados.cargos || null,
        dados.observacao || null,
        dados.dataHoraReuniao || null,
        dados.responsavelReuniaoId || null,
        dados.discriminator === "B2B"
          ? "Agendamento B2B recebido e aguardando processamento no RD Station."
          : dados.discriminator === "B2C"
            ? "Indicação B2C recebida e aguardando processamento no RD Station."
            : "Indicação recebida e aguardando processamento no RD Station.",
      ],
  );
  return resultado.insertId;
}

export async function registrarIndicacaoRecebida(dados: NovaIndicacaoSst) {
  const conexao = await abrirConexaoMySql();

  try {
    return await inserirIndicacao(conexao, dados);
  } finally {
    await conexao.end();
  }
}

export async function registrarIndicacoesRecebidas(
  indicacoes: NovaIndicacaoSst[],
) {
  if (indicacoes.length === 0) return [];

  const conexao = await abrirConexaoMySql();
  let transacaoAberta = false;

  try {
    await conexao.beginTransaction();
    transacaoAberta = true;

    const ids: number[] = [];
    for (const indicacao of indicacoes) {
      ids.push(await inserirIndicacao(conexao, indicacao));
    }

    await conexao.commit();
    transacaoAberta = false;
    return ids;
  } catch (erro) {
    if (transacaoAberta) {
      await conexao.rollback().catch(() => undefined);
    }
    throw erro;
  } finally {
    await conexao.end();
  }
}

export async function atualizarIndicacao(
  idIndicacao: number,
  atualizacao: AtualizacaoIndicacaoSst,
) {
  const conexao = await abrirConexaoMySql();

  try {
    await conexao.execute(
      `
        UPDATE indicacoessst
        SET status_integracao = ?,
            mensagem_integracao = ?,
            empresa_rd_id = COALESCE(?, empresa_rd_id),
            contato_rd_id = COALESCE(?, contato_rd_id),
            negociacao_rd_id = COALESCE(?, negociacao_rd_id)
        WHERE id = ?
      `,
      [
        atualizacao.status,
        atualizacao.mensagem ?? null,
        atualizacao.empresaRdId ?? null,
        atualizacao.contatoRdId ?? null,
        atualizacao.negociacaoRdId ?? null,
        idIndicacao,
      ],
    );
  } finally {
    await conexao.end();
  }
}

export async function contarAgendamentosB2BPorResponsavel(
  idsResponsaveis: string[],
  dataReferencia: string,
) {
  const ids = [...new Set(idsResponsaveis.filter(Boolean))];
  if (ids.length === 0) return new Map<string, number>();

  const correspondencia = /^(\d{4})-(\d{2})-\d{2}$/.exec(dataReferencia);
  if (!correspondencia) {
    throw new Error("Data de referência inválida para distribuir a reunião.");
  }

  const ano = Number(correspondencia[1]);
  const mes = Number(correspondencia[2]);
  const inicioMes = `${correspondencia[1]}-${correspondencia[2]}-01 00:00:00`;
  const proximoMes = new Date(Date.UTC(ano, mes, 1));
  const fimMes = `${proximoMes.getUTCFullYear()}-${String(
    proximoMes.getUTCMonth() + 1,
  ).padStart(2, "0")}-01 00:00:00`;
  const marcadores = ids.map(() => "?").join(", ");
  const conexao = await abrirConexaoMySql();

  try {
    const [linhas] = await conexao.execute<RowDataPacket[]>(
      `
        SELECT responsavel_reuniao_id, COUNT(*) AS total
        FROM indicacoessst
        WHERE discriminator = 'B2B'
          AND status_integracao <> 'erro'
          AND responsavel_reuniao_id IN (${marcadores})
          AND data_hora_reuniao >= ?
          AND data_hora_reuniao < ?
        GROUP BY responsavel_reuniao_id
      `,
      [...ids, inicioMes, fimMes],
    );

    const contagens = new Map(ids.map((id) => [id, 0]));
    for (const linha of linhas) {
      contagens.set(
        String(linha.responsavel_reuniao_id),
        Number(linha.total) || 0,
      );
    }
    return contagens;
  } finally {
    await conexao.end();
  }
}
