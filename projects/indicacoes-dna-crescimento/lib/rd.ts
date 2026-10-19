const RD_API = "https://crm.rdstation.com/api/v1";

export const SOURCE_PIPELINE_ID = "691497e81730fc001e0ab69c";
export const TARGET_PIPELINE_ID = "68b1adc416e69a001773f5c0";
export const INDICATOR_DEAL_FIELD_ID = "6abe60ad7da5db0020d2e994";
export const INDICATOR_NAME_FIELD_ID = "6abfdc4b85bce100283eb569";
export const DISTRIBUTION_TEAM_ID = "68b1b8ebdfe75a00191fc0db";

export class RdConfigurationError extends Error {
  constructor() {
    super("A integração com o RD Station ainda precisa do token de acesso.");
    this.name = "RdConfigurationError";
  }
}

export class RdApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RdApiError";
    this.status = status;
  }
}

function rdToken() {
  const token =
    process.env.RD_STATION_TOKEN?.trim() ||
    process.env.RD_CRM_V1_TOKEN?.trim();
  if (!token) throw new RdConfigurationError();
  return token;
}

export async function rdRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(`${RD_API}${path}`);
  url.searchParams.set("token", rdToken());

  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `O RD Station respondeu com o código ${response.status}.`;
    throw new RdApiError(detail, response.status);
  }

  return payload as T;
}

export function publicRdError(error: unknown) {
  if (error instanceof RdConfigurationError) return error.message;
  if (error instanceof RdApiError) {
    if (error.status === 401 || error.status === 403) {
      return "O token do RD Station não foi aceito. Atualize a credencial da integração.";
    }
    if (error.status === 429) {
      return "O RD Station recebeu muitas solicitações. Aguarde um instante e tente novamente.";
    }
    return `Não foi possível concluir a operação no RD Station. ${error.message}`;
  }
  return "Não foi possível comunicar com o RD Station. Tente novamente.";
}
