import { type Connection, type RowDataPacket } from "mysql2/promise";

import { openMySqlConnection } from "@/lib/mysql";

const RD_OAUTH_TOKEN_ID = "rd_crm_v2";
const RD_CRM_V2_BASE_URL = "https://api.rd.services/crm/v2";
const RD_OAUTH_TOKEN_TABLE = "`rd_st_qc`.`rd_oauth_tokens`";

type OAuthTokenRow = RowDataPacket & {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_type: string | null;
  expires_in: number | null;
  expires_soon: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  [key: string]: unknown;
};

type RdV2Response<T> = { data: T; errors?: unknown[] };

export type RdDealV2 = {
  id: string;
  name?: string;
  status?: "ongoing" | "won" | "lost" | "paused";
  owner_id?: string | null;
  stage_id?: string | null;
  organization_id?: string;
  contact_ids?: string[];
  custom_fields?: Record<string, string | number>;
  updated_at?: string;
};

export type RdStageV2 = { id: string; name: string };
export type RdUserV2 = { id: string; name: string; email?: string };
type RdCustomFieldV2 = {
  id: string;
  name?: string;
  slug: string;
  type?: string;
  entity: string;
  options?: string[];
};
export type RdTaskV2 = {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  status?: string;
  due_date?: string;
  deal_id?: string;
  owner_ids?: string[];
};

export class RdOAuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "RdOAuthError";
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new RdOAuthError(`A integração OAuth do RD não possui ${name}.`);
  return value;
}

async function refreshTokens(refreshToken: string) {
  const response = await fetch(
    process.env.RD_OAUTH_TOKEN_URL?.trim() || "https://api.rd.services/oauth2/token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: requiredEnvironment("RD_CLIENT_ID"),
        client_secret: requiredEnvironment("RD_CLIENT_SECRET"),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    },
  );
  const result = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !result.access_token) {
    throw new RdOAuthError(
      "Não foi possível renovar o token OAuth do RD Station.",
      response.status,
    );
  }
  return result;
}

async function lockedToken(connection: Connection) {
  const [rows] = await connection.execute<OAuthTokenRow[]>(
    `
      SELECT id, access_token, refresh_token, token_type, expires_in,
             CASE
               WHEN expires_at IS NULL THEN 0
               WHEN expires_at <= DATE_ADD(NOW(), INTERVAL 5 MINUTE) THEN 1
               ELSE 0
             END AS expires_soon
      FROM ${RD_OAUTH_TOKEN_TABLE}
      WHERE id = ?
      FOR UPDATE
    `,
    [RD_OAUTH_TOKEN_ID],
  );
  return rows[0];
}

async function saveTokens(
  connection: Connection,
  current: OAuthTokenRow,
  fresh: TokenResponse,
) {
  const accessToken = String(fresh.access_token || "").trim();
  const refreshToken = String(fresh.refresh_token || current.refresh_token || "").trim();
  const tokenType = String(fresh.token_type || current.token_type || "bearer").trim();
  const expiresIn = Number(fresh.expires_in || 7200);
  if (!accessToken || !refreshToken) {
    throw new RdOAuthError("O RD não retornou o par completo de tokens OAuth.");
  }
  await connection.execute(
    `
      UPDATE ${RD_OAUTH_TOKEN_TABLE}
      SET access_token = ?, refresh_token = ?, token_type = ?, expires_in = ?,
          expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
          raw_payload_json = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [
      accessToken,
      refreshToken,
      tokenType,
      expiresIn,
      expiresIn,
      JSON.stringify(fresh),
      RD_OAUTH_TOKEN_ID,
    ],
  );
  return accessToken;
}

async function accessToken(rejectedToken?: string) {
  const connection = await openMySqlConnection();
  let transactionOpen = false;
  try {
    await connection.beginTransaction();
    transactionOpen = true;
    const current = await lockedToken(connection);
    if (!current) {
      throw new RdOAuthError(`Token OAuth ${RD_OAUTH_TOKEN_ID} não encontrado no banco.`);
    }
    const currentAccessToken = String(current.access_token || "").trim();
    const alreadyChanged = Boolean(
      rejectedToken && currentAccessToken && rejectedToken !== currentAccessToken,
    );
    if (
      currentAccessToken &&
      !current.expires_soon &&
      (!rejectedToken || alreadyChanged)
    ) {
      await connection.commit();
      transactionOpen = false;
      return currentAccessToken;
    }
    const currentRefreshToken = String(current.refresh_token || "").trim();
    if (!currentRefreshToken) {
      throw new RdOAuthError("Refresh token OAuth do RD não encontrado no banco.");
    }
    const token = await saveTokens(
      connection,
      current,
      await refreshTokens(currentRefreshToken),
    );
    await connection.commit();
    transactionOpen = false;
    return token;
  } catch (error) {
    if (transactionOpen) await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

async function rdV2Request<T>(path: string, init: RequestInit) {
  let token = await accessToken();
  const execute = (currentToken: string) =>
    fetch(`${RD_CRM_V2_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${currentToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  let response = await execute(token);
  if (response.status === 401) {
    token = await accessToken(token);
    response = await execute(token);
  }
  const result = (await response.json().catch(() => ({}))) as RdV2Response<T>;
  if (!response.ok || !result.data) {
    throw new RdOAuthError(
      `O RD Station recusou a criação da tarefa (${response.status}).`,
      response.status,
      JSON.stringify(result.errors ?? []).slice(0, 1000),
    );
  }
  return result.data;
}

export async function createRdMeetingTask(data: {
  dealId: string;
  dueDateIso: string;
  responsibleId: string;
  description: string;
}) {
  const task = await rdV2Request<RdTaskV2>("/tasks", {
    method: "POST",
    body: JSON.stringify({
      data: {
        name: "APRESENTAÇÃO PARCERIA NA PRÁTICA CLUB -  QUALITYSST",
        description: data.description,
        type: "meeting",
        status: "open",
        due_date: data.dueDateIso,
        deal_id: data.dealId,
        created_by_id: data.responsibleId,
        owner_ids: [data.responsibleId],
      },
    }),
  });
  if (!task.id) throw new RdOAuthError("O RD não retornou o ID da tarefa criada.");
  let confirmedTask = await confirmRdTask(task.id);
  const expectedTime = Date.parse(data.dueDateIso);
  const confirmedTime = () => Date.parse(confirmedTask.due_date ?? "");

  if (!Number.isFinite(expectedTime) || confirmedTime() !== expectedTime) {
    await rdV2Request<RdTaskV2>(`/tasks/${encodeURIComponent(task.id)}`, {
      method: "PUT",
      body: JSON.stringify({ data: { due_date: data.dueDateIso } }),
    });
    confirmedTask = await confirmRdTask(task.id);
  }

  if (confirmedTime() !== expectedTime) {
    await rdV2Request<RdTaskV2>(`/tasks/${encodeURIComponent(task.id)}`, {
      method: "PUT",
      body: JSON.stringify({ data: { status: "canceled" } }),
    }).catch(() => undefined);
    throw new RdOAuthError(
      "O RD confirmou a tarefa em um horário diferente do Google Agenda.",
      undefined,
      `esperado=${data.dueDateIso} confirmado=${confirmedTask.due_date ?? "ausente"}`,
    );
  }

  console.info("Horário da reunião confirmado no RD Station.", {
    taskId: confirmedTask.id,
    dueDate: confirmedTask.due_date,
  });
  return confirmedTask.id;
}

export async function findLatestOrganizationDealInPipeline(
  organizationId: string,
  pipelineId: string,
) {
  const pageSize = 100;
  const deals: RdDealV2[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const parameters = new URLSearchParams({
      filter: `organization_id:${organizationId} pipeline_id:${pipelineId}`,
      sort: "-updated_at",
      "page[number]": String(page),
      "page[size]": String(pageSize),
    });
    const pageDeals = await rdV2Request<RdDealV2[]>(
      `/deals?${parameters}`,
      { method: "GET" },
    );
    deals.push(...pageDeals);
    if (pageDeals.length < pageSize) break;
  }
  const latestDeal = deals
    .filter((deal) => deal.id)
    .sort((left, right) => {
      const rightUpdatedAt = Date.parse(right.updated_at ?? "") || 0;
      const leftUpdatedAt = Date.parse(left.updated_at ?? "") || 0;
      return rightUpdatedAt - leftUpdatedAt || right.id.localeCompare(left.id);
    })[0];
  if (!latestDeal?.id) return null;
  return rdV2Request<RdDealV2>(`/deals/${encodeURIComponent(latestDeal.id)}`, {
    method: "GET",
  });
}

export function getRdPipelineStage(pipelineId: string, stageId: string) {
  return rdV2Request<RdStageV2>(
    `/pipelines/${encodeURIComponent(pipelineId)}/stages/${encodeURIComponent(stageId)}`,
    { method: "GET" },
  );
}

export function getRdUser(userId: string) {
  return rdV2Request<RdUserV2>(`/users/${encodeURIComponent(userId)}`, {
    method: "GET",
  });
}

function normalizeOption(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

export async function getRdDealOption(fieldId: string, optionName: string) {
  const field = await rdV2Request<RdCustomFieldV2>(
    `/custom_fields/${encodeURIComponent(fieldId)}`,
    { method: "GET" },
  );
  if (!field.slug || field.entity !== "deal" || field.type !== "option") {
    throw new RdOAuthError(
      "O campo personalizado informado não é uma lista de opções da negociação.",
    );
  }
  const expected = normalizeOption(optionName);
  const option = field.options?.find(
    (value) => normalizeOption(value) === expected,
  );
  if (!option) {
    throw new RdOAuthError(
      `A opção ${optionName} não existe no campo personalizado do RD.`,
    );
  }
  return { slug: field.slug, value: option };
}

export async function createRdContactTask(data: {
  dealId: string;
  dueDateIso: string;
  responsibleId: string;
  description: string;
}) {
  const task = await rdV2Request<RdTaskV2>("/tasks", {
    method: "POST",
    body: JSON.stringify({
      data: {
        name: "Tentativa de Agendamento de Reunião",
        description: data.description,
        type: "task",
        status: "open",
        due_date: data.dueDateIso,
        deal_id: data.dealId,
        created_by_id: data.responsibleId,
        owner_ids: [data.responsibleId],
      },
    }),
  });
  if (!task.id) throw new RdOAuthError("O RD não retornou o ID da tarefa criada.");
  const confirmedTask = await confirmRdTask(task.id);
  if (
    confirmedTask.deal_id !== data.dealId ||
    confirmedTask.type !== "task" ||
    confirmedTask.status !== "open"
  ) {
    throw new RdOAuthError(
      "O RD retornou a tarefa, mas ela não foi vinculada corretamente à negociação.",
    );
  }
  console.info("Tarefa de tentativa confirmada no RD Station.", {
    taskId: confirmedTask.id,
    dealId: confirmedTask.deal_id,
    type: confirmedTask.type,
    status: confirmedTask.status,
  });
  return confirmedTask.id;
}

async function confirmRdTask(taskId: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await rdV2Request<RdTaskV2>(
        `/tasks/${encodeURIComponent(taskId)}`,
        { method: "GET" },
      );
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export async function createRdContact(data: {
  organizationId: string;
  name: string;
  phone: string;
  email: string;
}) {
  const contact = await rdV2Request<{ id?: string }>("/contacts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        name: data.name,
        organization_id: data.organizationId,
        phones: [{ phone: data.phone, type: "mobile" }],
        emails: [{ email: data.email }],
      },
    }),
  });
  if (!contact.id) throw new RdOAuthError("O RD não retornou o ID do contato criado.");
  return contact.id;
}

export async function createRdSstDeal(data: {
  name: string;
  organizationId: string;
  contactId: string;
  responsibleId: string;
  stageId: string;
  campaignId: string;
  customFields: Record<string, string | number>;
}) {
  const deal = await rdV2Request<RdDealV2>("/deals", {
    method: "POST",
    body: JSON.stringify({
      data: {
        name: data.name,
        status: "ongoing",
        stage_id: data.stageId,
        campaign_id: data.campaignId,
        organization_id: data.organizationId,
        contact_ids: [data.contactId],
        owner_id: data.responsibleId,
        custom_fields: data.customFields,
      },
    }),
  });
  if (!deal.id) throw new RdOAuthError("O RD não retornou o ID da negociação criada.");
  return deal;
}

export function updateRdDealForBooking(data: {
  deal: RdDealV2;
  name: string;
  organizationId: string;
  contactId: string;
  responsibleId: string;
  stageId: string;
  campaignId: string;
  customFields: Record<string, string | number>;
}) {
  return rdV2Request<RdDealV2>(`/deals/${encodeURIComponent(data.deal.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      data: {
        name: data.name,
        ...(data.deal.status === "lost" ? { status: "ongoing" } : {}),
        owner_id: data.responsibleId,
        stage_id: data.stageId,
        campaign_id: data.campaignId,
        organization_id: data.organizationId,
        contact_ids: Array.from(
          new Set([...(data.deal.contact_ids ?? []), data.contactId]),
        ),
        custom_fields: data.customFields,
      },
    }),
  });
}
