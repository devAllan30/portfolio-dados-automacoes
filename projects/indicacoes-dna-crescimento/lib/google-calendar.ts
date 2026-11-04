import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { importPKCS8, SignJWT } from "jose";
import {
  getSstScheduleInstant,
  SST_MEETING_DURATION_MINUTES,
  SST_MINIMUM_NOTICE_MINUTES,
  SST_TIME_ZONE,
} from "@/lib/sst-schedule";

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events.owned",
] as const;
const MEET_SETTINGS_SCOPE =
  "https://www.googleapis.com/auth/meetings.space.settings";
const TIME_ZONE = process.env.GOOGLE_CALENDAR_TIMEZONE?.trim() || SST_TIME_ZONE;
const MEETING_DURATION_MINUTES = SST_MEETING_DURATION_MINUTES;
const MINIMUM_NOTICE_MINUTES = SST_MINIMUM_NOTICE_MINUTES;
const EVENT_ORIGIN = "indicacao-ecossistema-sst";

export const GOOGLE_CALENDAR_TIMES = Array.from({ length: 19 }, (_, index) => {
  const totalMinutes = 8 * 60 + 30 + index * 30;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(
    totalMinutes % 60,
  ).padStart(2, "0")}`;
});

type ServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
  private_key_id?: string;
};

export type CalendarUser = {
  id: string;
  name: string;
  email: string;
};

type BusyInterval = { start: string; end: string };
type FreeBusyResponse = {
  calendars?: Record<
    string,
    {
      busy?: BusyInterval[];
      errors?: Array<{ domain?: string; reason?: string }>;
    }
  >;
};
type GoogleEvent = {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  attendees?: Array<{ email?: string }>;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
    createRequest?: { status?: { statusCode?: "pending" | "success" | "failure" } };
  };
};
type GoogleMeetSpace = {
  name?: string;
  config?: { accessType?: string; entryPointAccess?: string };
};

export type GoogleReservation = {
  id: string;
  eventLink?: string;
  meetLink: string;
  ownerEmail: string;
  scheduledAt: string;
  scheduledAtIso: string;
};

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

let loadedCredentials: Promise<ServiceAccountCredentials> | null = null;
let loadedPrivateKey: Promise<CryptoKey> | null = null;
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

function tokenKey(email: string, scopes: readonly string[]) {
  return `${email}|${Array.from(new Set(scopes)).sort().join(" ")}`;
}

function credentialPath() {
  const configured = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!configured) {
    throw new GoogleCalendarError(
      "A credencial do Google Agenda não foi configurada.",
      "GOOGLE_CREDENTIAL_MISSING",
    );
  }
  return isAbsolute(configured)
    ? configured
    : resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

async function loadCredentials() {
  if (!loadedCredentials) {
    loadedCredentials = (async () => {
      let raw: string;
      const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
      try {
        raw = encoded
          ? Buffer.from(encoded, "base64").toString("utf8")
          : await readFile(credentialPath(), "utf8");
      } catch (error) {
        throw new GoogleCalendarError(
          "Não foi possível ler a credencial do Google Agenda.",
          "GOOGLE_CREDENTIAL_UNREADABLE",
          error instanceof Error ? error.message : undefined,
        );
      }

      let credentials: ServiceAccountCredentials;
      try {
        credentials = JSON.parse(raw) as ServiceAccountCredentials;
      } catch {
        throw new GoogleCalendarError(
          "A credencial do Google Agenda não é um JSON válido.",
          "GOOGLE_CREDENTIAL_INVALID",
        );
      }
      if (!credentials.client_email || !credentials.private_key) {
        throw new GoogleCalendarError(
          "O JSON informado não contém uma conta de serviço válida.",
          "GOOGLE_CREDENTIAL_INCOMPLETE",
        );
      }
      return credentials;
    })();
  }
  return loadedCredentials;
}

async function privateKey(credentials: ServiceAccountCredentials) {
  if (!loadedPrivateKey) {
    loadedPrivateKey = importPKCS8(credentials.private_key!, "RS256");
  }
  return loadedPrivateKey;
}

async function accessToken(
  userEmail: string,
  scopes: readonly string[] = CALENDAR_SCOPES,
) {
  const email = userEmail.trim().toLocaleLowerCase("pt-BR");
  const key = tokenKey(email, scopes);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 5 * 60_000) {
    return cached.accessToken;
  }

  const credentials = await loadCredentials();
  const now = Math.floor(Date.now() / 1_000);
  const assertion = await new SignJWT({
    scope: Array.from(new Set(scopes)).join(" "),
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
      ...(credentials.private_key_id ? { kid: credentials.private_key_id } : {}),
    })
    .setIssuer(credentials.client_email!)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3_600)
    .sign(await privateKey(credentials));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "identity",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const text = await response.text();
  let result: {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } = {};
  try {
    result = JSON.parse(text) as typeof result;
  } catch {
    // The response text is included in the error details below.
  }
  if (!response.ok || !result.access_token) {
    throw new GoogleCalendarError(
      "O Google não autorizou a conta de serviço.",
      "GOOGLE_OAUTH_REJECTED",
      [
        `HTTP ${response.status}`,
        result.error,
        result.error_description,
        !result.error ? text.slice(0, 500) : "",
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }

  tokenCache.set(key, {
    accessToken: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3_600) * 1_000,
  });
  return result.access_token;
}

async function googleRequest<T>(
  userEmail: string,
  options: {
    url: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    data?: unknown;
    scopes?: readonly string[];
  },
) {
  const scopes = options.scopes ?? CALENDAR_SCOPES;
  const execute = async (token: string) =>
    fetch(options.url, {
      method: options.method,
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "identity",
        Authorization: `Bearer ${token}`,
        ...(options.data ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.data ? { body: JSON.stringify(options.data) } : {}),
    });

  let response = await execute(await accessToken(userEmail, scopes));
  if (response.status === 401) {
    tokenCache.delete(tokenKey(userEmail.trim().toLocaleLowerCase("pt-BR"), scopes));
    response = await execute(await accessToken(userEmail, scopes));
  }
  if (!response.ok) {
    const details = (await response.text()).slice(0, 1_500);
    throw new GoogleCalendarError(
      "O Google Agenda recusou a solicitação.",
      "GOOGLE_API_REJECTED",
      `HTTP ${response.status} | ${details}`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function dateTime(date: string, time: string) {
  try {
    return getSstScheduleInstant(date, time).date;
  } catch {
    throw new GoogleCalendarError(
      "A data ou o horário informado é inválido.",
      "INVALID_DATE_TIME",
    );
  }
}

function isFree(start: Date, end: Date, busyIntervals: BusyInterval[]) {
  return !busyIntervals.some((interval) => {
    const busyStart = new Date(interval.start).getTime();
    const busyEnd = new Date(interval.end).getTime();
    return start.getTime() < busyEnd && end.getTime() > busyStart;
  });
}

async function userBusyIntervals(user: CalendarUser, date: string) {
  const start = dateTime(date, "08:00");
  const end = dateTime(date, "18:30");
  const response = await googleRequest<FreeBusyResponse>(user.email, {
    url: "https://www.googleapis.com/calendar/v3/freeBusy",
    method: "POST",
    data: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: TIME_ZONE,
      items: [{ id: user.email }],
    },
  });
  const calendar =
    response.calendars?.[user.email] ??
    Object.values(response.calendars ?? {})[0];
  if (!calendar || calendar.errors?.length) {
    throw new GoogleCalendarError(
      "Não foi possível consultar uma das agendas da equipe.",
      "GOOGLE_CALENDAR_INACCESSIBLE",
      JSON.stringify(calendar?.errors ?? []),
    );
  }
  return calendar.busy ?? [];
}

export async function calendarAvailability(users: CalendarUser[], date: string) {
  if (!users.length) {
    throw new GoogleCalendarError(
      "Nenhum usuário da equipe CLOSER SST possui um e-mail válido no RD.",
      "GOOGLE_NO_USERS",
    );
  }

  const calendars = (
    await Promise.all(
      users.map(async (user) => {
        try {
          return { user, busy: await userBusyIntervals(user, date) };
        } catch (error) {
          console.error("Agenda de um closer indisponível.", {
            rd_user_id: user.id,
            code: error instanceof GoogleCalendarError ? error.code : "UNKNOWN",
          });
          return null;
        }
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (!calendars.length) {
    throw new GoogleCalendarError(
      "Não foi possível consultar as agendas dos Closers.",
      "GOOGLE_NO_ACCESSIBLE_CALENDAR",
    );
  }

  const minimumStart = Date.now() + MINIMUM_NOTICE_MINUTES * 60_000;
  return GOOGLE_CALENDAR_TIMES.map((time) => {
    const start = dateTime(date, time);
    const end = new Date(start.getTime() + MEETING_DURATION_MINUTES * 60_000);
    return {
      time,
      availableUsers:
        start.getTime() < minimumStart
          ? []
          : calendars
              .filter(({ busy }) => isFree(start, end, busy))
              .map(({ user }) => user),
    };
  });
}

function meetLink(event: GoogleEvent) {
  return (
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video",
    )?.uri
  );
}

async function waitForMeetLink(
  ownerEmail: string,
  eventId: string,
  initialEvent: GoogleEvent,
) {
  let event = initialEvent;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const link = meetLink(event);
    if (link) return link;
    if (event.conferenceData?.createRequest?.status?.statusCode === "failure") break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
    event = await googleRequest<GoogleEvent>(ownerEmail, {
      url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      method: "GET",
    });
  }
  throw new GoogleCalendarError(
    "O Google criou o evento, mas não confirmou a sala do Google Meet.",
    "GOOGLE_MEET_NOT_CREATED",
  );
}

function meetCode(link: string) {
  try {
    const url = new URL(link);
    if (url.hostname !== "meet.google.com") return null;
    const code = url.pathname.replace(/^\/+|\/+$/g, "");
    return /^[a-z]+(?:-[a-z]+){2}$/i.test(code) ? code : null;
  } catch {
    return null;
  }
}

async function configureOpenMeet(ownerEmail: string, link: string) {
  const code = meetCode(link);
  if (!code) return;
  const space = await googleRequest<GoogleMeetSpace>(ownerEmail, {
    url: `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(code)}`,
    method: "GET",
    scopes: [MEET_SETTINGS_SCOPE],
  });
  if (!space.name?.startsWith("spaces/")) return;
  await googleRequest<GoogleMeetSpace>(ownerEmail, {
    url: `https://meet.googleapis.com/v2/${space.name}?updateMask=config.accessType,config.entryPointAccess`,
    method: "PATCH",
    scopes: [MEET_SETTINGS_SCOPE],
    data: {
      name: space.name,
      config: { accessType: "OPEN", entryPointAccess: "ALL" },
    },
  });
}

export async function createGoogleEvent(data: {
  owner: CalendarUser;
  date: string;
  time: string;
  companyName: string;
  participantEmails: string[];
  description: string;
  bookingId: number;
}) {
  const schedule = getSstScheduleInstant(data.date, data.time);
  const start = schedule.date;
  const end = new Date(start.getTime() + MEETING_DURATION_MINUTES * 60_000);
  const participantEmails = Array.from(
    new Set(
      data.participantEmails
        .map((email) => email.trim().toLocaleLowerCase("pt-BR"))
        .filter(
          (email) => email && email !== data.owner.email.toLocaleLowerCase("pt-BR"),
        ),
    ),
  );

  const event = await googleRequest<GoogleEvent>(data.owner.email, {
    url: "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    method: "POST",
    data: {
      summary: `Apresentação Ecossistema Na Prática - QUALITYSST - ${data.companyName}`,
      description: data.description,
      attendees: participantEmails.map((email) => ({ email })),
      start: { dateTime: schedule.rfc3339, timeZone: TIME_ZONE },
      end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
      transparency: "opaque",
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      extendedProperties: {
        private: {
          origem: EVENT_ORIGIN,
          agendamento_sst_id: String(data.bookingId),
        },
      },
    },
  });

  if (!event.id) {
    throw new GoogleCalendarError(
      "O Google não confirmou a criação do evento.",
      "GOOGLE_EVENT_WITHOUT_ID",
    );
  }

  try {
    const confirmedStart = Date.parse(event.start?.dateTime ?? "");
    if (!Number.isFinite(confirmedStart) || confirmedStart !== start.getTime()) {
      throw new GoogleCalendarError(
        "O Google Agenda confirmou um horário diferente do selecionado.",
        "GOOGLE_EVENT_TIME_MISMATCH",
        `esperado=${schedule.iso} confirmado=${event.start?.dateTime ?? "ausente"}`,
      );
    }
    const link = await waitForMeetLink(data.owner.email, event.id, event);
    await configureOpenMeet(data.owner.email, link).catch((error) => {
      console.warn("Não foi possível configurar o Meet como acesso aberto.", {
        code: error instanceof GoogleCalendarError ? error.code : "UNKNOWN",
      });
    });
    return {
      id: event.id,
      eventLink: event.htmlLink,
      meetLink: link,
      ownerEmail: data.owner.email,
      scheduledAt: schedule.rfc3339,
      scheduledAtIso: schedule.iso,
    } satisfies GoogleReservation;
  } catch (error) {
    await googleRequest<unknown>(data.owner.email, {
      url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event.id)}`,
      method: "DELETE",
    }).catch(() => undefined);
    throw error;
  }
}

export async function deleteGoogleEvent(reservation: GoogleReservation) {
  await googleRequest<unknown>(reservation.ownerEmail, {
    url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(reservation.id)}`,
    method: "DELETE",
  });
}
