import {
  createConnection,
  type Connection,
  type ConnectionOptions,
  type RowDataPacket,
} from "mysql2/promise";

const ID_TOKEN_RD = "rd_crm_v2";

type LinhaTokenOAuth = RowDataPacket & {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_type: string | null;
  expires_in: number | null;
  expires_soon: number;
};

type RespostaRefreshToken = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  [chave: string]: unknown;
};

function variavelObrigatoria(nome: string) {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    throw new Error(`A variável de servidor ${nome} não está configurada.`);
  }
  return valor;
}

export async function abrirConexaoMySql() {
  const configuracao = {
    host: variavelObrigatoria("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT || "3306"),
    user: variavelObrigatoria("MYSQL_USER"),
    password: variavelObrigatoria("MYSQL_PASSWORD"),
    database: variavelObrigatoria("MYSQL_DATABASE"),
    charset: "utf8mb4",
    connectTimeout: 15_000,
    disableEval: true,
  } satisfies ConnectionOptions & { disableEval: boolean };

  return createConnection(configuracao);
}

async function solicitarNovosTokens(refreshToken: string) {
  const corpo = new URLSearchParams({
    client_id: variavelObrigatoria("RD_CLIENT_ID"),
    client_secret: variavelObrigatoria("RD_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const resposta = await fetch(
    process.env.RD_OAUTH_TOKEN_URL?.trim() ||
      "https://api.rd.services/oauth2/token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: corpo,
    },
  );

  const conteudo = (await resposta.json().catch(() => ({}))) as RespostaRefreshToken;

  if (!resposta.ok || !conteudo.access_token) {
    throw new Error(`Não foi possível renovar o token OAuth do RD (${resposta.status}).`);
  }

  return conteudo;
}

async function consultarTokenComBloqueio(conexao: Connection) {
  const [linhas] = await conexao.execute<LinhaTokenOAuth[]>(
    `
      SELECT id, access_token, refresh_token, token_type, expires_in,
             CASE
               WHEN expires_at IS NULL THEN 0
               WHEN expires_at <= DATE_ADD(NOW(), INTERVAL 5 MINUTE) THEN 1
               ELSE 0
             END AS expires_soon
      FROM rd_oauth_tokens
      WHERE id = ?
      FOR UPDATE
    `,
    [ID_TOKEN_RD],
  );

  return linhas[0];
}

async function salvarTokens(
  conexao: Connection,
  atual: LinhaTokenOAuth,
  novos: RespostaRefreshToken,
) {
  const accessToken = String(novos.access_token || "").trim();
  const refreshToken = String(novos.refresh_token || atual.refresh_token || "").trim();
  const tokenType = String(novos.token_type || atual.token_type || "bearer").trim();
  const expiresIn = Number(novos.expires_in || 7200);

  if (!accessToken || !refreshToken) {
    throw new Error("O RD não retornou o novo par completo de tokens OAuth.");
  }

  await conexao.execute(
    `
      UPDATE rd_oauth_tokens
      SET access_token = ?,
          refresh_token = ?,
          token_type = ?,
          expires_in = ?,
          expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
          raw_payload_json = ?,
          updated_at = NOW()
      WHERE id = ?
    `,
    [
      accessToken,
      refreshToken,
      tokenType,
      expiresIn,
      expiresIn,
      JSON.stringify(novos),
      ID_TOKEN_RD,
    ],
  );

  return accessToken;
}

export async function obterAccessTokenRd(tokenRecusado?: string) {
  const conexao = await abrirConexaoMySql();
  let transacaoAberta = false;

  try {
    await conexao.beginTransaction();
    transacaoAberta = true;

    const tokenAtual = await consultarTokenComBloqueio(conexao);
    if (!tokenAtual) {
      throw new Error(`Token OAuth ${ID_TOKEN_RD} não encontrado no banco.`);
    }

    const accessTokenAtual = String(tokenAtual.access_token || "").trim();
    const tokenJaFoiTrocado = Boolean(
      tokenRecusado && accessTokenAtual && tokenRecusado !== accessTokenAtual,
    );

    if (accessTokenAtual && !tokenAtual.expires_soon && (!tokenRecusado || tokenJaFoiTrocado)) {
      await conexao.commit();
      transacaoAberta = false;
      return accessTokenAtual;
    }

    const refreshToken = String(tokenAtual.refresh_token || "").trim();
    if (!refreshToken) {
      throw new Error("Refresh token do RD não encontrado no banco.");
    }

    const novosTokens = await solicitarNovosTokens(refreshToken);
    const accessToken = await salvarTokens(conexao, tokenAtual, novosTokens);

    await conexao.commit();
    transacaoAberta = false;
    return accessToken;
  } catch (erro) {
    if (transacaoAberta) {
      await conexao.rollback().catch(() => undefined);
    }
    throw erro;
  } finally {
    await conexao.end();
  }
}
