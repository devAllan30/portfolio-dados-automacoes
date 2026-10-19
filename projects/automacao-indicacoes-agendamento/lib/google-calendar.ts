import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { importPKCS8, SignJWT } from "jose";

const ESCOPO_DISPONIBILIDADE =
  "https://www.googleapis.com/auth/calendar.freebusy";
const ESCOPO_EVENTOS_PROPRIOS =
  "https://www.googleapis.com/auth/calendar.events.owned";
const ESCOPO_CONFIGURACOES_MEET =
  "https://www.googleapis.com/auth/meetings.space.settings";
const ESCOPOS_CALENDARIO = [
  ESCOPO_DISPONIBILIDADE,
  ESCOPO_EVENTOS_PROPRIOS,
] as const;
const FUSO_HORARIO =
  process.env.GOOGLE_CALENDAR_TIMEZONE?.trim() || "America/Sao_Paulo";
const DURACAO_REUNIAO_MINUTOS = 30;
export const ANTECEDENCIA_MINIMA_MINUTOS = 15;
const ORIGEM_EVENTO = "indicacao-b2b-sst";

export const HORARIOS_AGENDA = Array.from({ length: 21 }, (_, indice) => {
  const minutosTotais = 8 * 60 + indice * 30;
  const hora = Math.floor(minutosTotais / 60);
  const minutos = minutosTotais % 60;
  return `${String(hora).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
});

type CredenciaisContaServico = {
  client_email?: string;
  private_key?: string;
  private_key_id?: string;
  project_id?: string;
};

export type UsuarioAgenda = {
  id: string;
  nome: string;
  email: string;
};

type IntervaloOcupado = {
  start: string;
  end: string;
};

type RespostaDisponibilidade = {
  calendars?: Record<
    string,
    {
      busy?: IntervaloOcupado[];
      errors?: Array<{ domain?: string; reason?: string }>;
    }
  >;
};

type EventoGoogle = {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  attendees?: Array<{ email?: string }>;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
    createRequest?: {
      status?: {
        statusCode?: "pending" | "success" | "failure";
      };
    };
  };
};

type EspacoGoogleMeet = {
  name?: string;
  meetingUri?: string;
  meetingCode?: string;
  config?: {
    accessType?: string;
    entryPointAccess?: string;
  };
};

export type ReservaGoogle = {
  id: string;
  link?: string;
  linkMeet: string;
  emailResponsavel: string;
};

export class ErroGoogleAgenda extends Error {
  constructor(
    mensagem: string,
    public readonly codigo: string,
    public readonly detalhes?: string,
  ) {
    super(mensagem);
  }
}

let credenciaisCarregadas: Promise<CredenciaisContaServico> | null = null;
let chavePrivadaCarregada: Promise<CryptoKey> | null = null;
const tokensPorUsuario = new Map<
  string,
  { accessToken: string; expiraEm: number }
>();

function chaveToken(email: string, escopos: readonly string[]) {
  return `${email}|${Array.from(new Set(escopos)).sort().join(" ")}`;
}

function caminhoCredenciais() {
  const informado = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!informado) {
    throw new ErroGoogleAgenda(
      "A credencial do Google Agenda não foi configurada.",
      "GOOGLE_CREDENCIAL_AUSENTE",
    );
  }
  return isAbsolute(informado) ? informado : resolve(process.cwd(), informado);
}

async function carregarCredenciais() {
  if (!credenciaisCarregadas) {
    credenciaisCarregadas = (async () => {
      let conteudo: string;
      const credencialEmMemoria =
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
      if (credencialEmMemoria) {
        try {
          conteudo = Buffer.from(credencialEmMemoria, "base64").toString(
            "utf8",
          );
        } catch (erro) {
          throw new ErroGoogleAgenda(
            "A credencial do Google Agenda em memória é inválida.",
            "GOOGLE_CREDENCIAL_MEMORIA_INVALIDA",
            erro instanceof Error ? erro.message : undefined,
          );
        }
      } else {
        try {
          conteudo = await readFile(caminhoCredenciais(), "utf8");
        } catch (erro) {
          throw new ErroGoogleAgenda(
            "Não foi possível ler a credencial do Google Agenda.",
            "GOOGLE_CREDENCIAL_ILEGIVEL",
            erro instanceof Error ? erro.message : undefined,
          );
        }
      }

      let credenciais: CredenciaisContaServico;
      try {
        credenciais = JSON.parse(conteudo) as CredenciaisContaServico;
      } catch {
        throw new ErroGoogleAgenda(
          "O arquivo de credencial do Google Agenda não é um JSON válido.",
          "GOOGLE_CREDENCIAL_INVALIDA",
        );
      }

      if (!credenciais.client_email || !credenciais.private_key) {
        throw new ErroGoogleAgenda(
          "O JSON informado não contém uma conta de serviço válida.",
          "GOOGLE_CREDENCIAL_INCOMPLETA",
        );
      }
      return credenciais;
    })();
  }
  return credenciaisCarregadas;
}

async function obterChavePrivada(credenciais: CredenciaisContaServico) {
  if (!chavePrivadaCarregada) {
    chavePrivadaCarregada = importPKCS8(credenciais.private_key!, "RS256");
  }
  return chavePrivadaCarregada;
}

async function obterAccessToken(
  emailUsuario: string,
  escopos: readonly string[] = ESCOPOS_CALENDARIO,
) {
  const email = emailUsuario.trim().toLocaleLowerCase("pt-BR");
  const chave = chaveToken(email, escopos);
  const salvo = tokensPorUsuario.get(chave);
  if (salvo && salvo.expiraEm > Date.now() + 5 * 60_000) {
    return salvo.accessToken;
  }

  const credenciais = await carregarCredenciais();
  const agora = Math.floor(Date.now() / 1_000);
  const declaracao = await new SignJWT({
    scope: Array.from(new Set(escopos)).join(" "),
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
      ...(credenciais.private_key_id
        ? { kid: credenciais.private_key_id }
        : {}),
    })
    .setIssuer(credenciais.client_email!)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(agora)
    .setExpirationTime(agora + 3_600)
    .sign(await obterChavePrivada(credenciais));

  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "identity",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: declaracao,
    }),
  });
  const textoResposta = await resposta.text();
  let conteudo: {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } = {};
  try {
    conteudo = JSON.parse(textoResposta) as typeof conteudo;
  } catch {
    // O texto original é incluído abaixo somente quando houver erro.
  }

  if (!resposta.ok || !conteudo.access_token) {
    throw new ErroGoogleAgenda(
      "O Google não autorizou a conta de serviço.",
      "GOOGLE_OAUTH_RECUSOU",
      [
        `HTTP ${resposta.status}`,
        conteudo.error,
        conteudo.error_description,
        !conteudo.error ? textoResposta.slice(0, 500) : "",
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }

  const token = {
    accessToken: conteudo.access_token,
    expiraEm: Date.now() + (conteudo.expires_in ?? 3_600) * 1_000,
  };
  tokensPorUsuario.set(chave, token);
  return token.accessToken;
}

async function requisicaoGoogle<T>(
  emailUsuario: string,
  opcoes: {
    url: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    data?: unknown;
    escopos?: readonly string[];
  },
) {
  const escopos = opcoes.escopos ?? ESCOPOS_CALENDARIO;
  const executar = async (token: string) =>
    fetch(opcoes.url, {
      method: opcoes.method,
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "identity",
        Authorization: `Bearer ${token}`,
        ...(opcoes.data ? { "Content-Type": "application/json" } : {}),
      },
      ...(opcoes.data ? { body: JSON.stringify(opcoes.data) } : {}),
    });

  let resposta = await executar(
    await obterAccessToken(emailUsuario, escopos),
  );
  if (resposta.status === 401) {
    const email = emailUsuario.trim().toLocaleLowerCase("pt-BR");
    tokensPorUsuario.delete(chaveToken(email, escopos));
    resposta = await executar(await obterAccessToken(emailUsuario, escopos));
  }

  if (!resposta.ok) {
    const detalhes = (await resposta.text()).slice(0, 1_500);
    throw new ErroGoogleAgenda(
      "O Google Agenda recusou a solicitação.",
      "GOOGLE_API_RECUSOU",
      `HTTP ${resposta.status} | ${detalhes}`,
    );
  }

  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

function emailValido(valor?: string) {
  return Boolean(valor && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim()));
}

export function usuariosRdComAgenda(
  usuarios: Array<{ id: string; name: string; email?: string }>,
) {
  return usuarios
    .filter((usuario) => usuario.id && usuario.name && emailValido(usuario.email))
    .map((usuario) => ({
      id: usuario.id,
      nome: usuario.name.trim(),
      email: usuario.email!.trim().toLocaleLowerCase("pt-BR"),
    }));
}

function dataHora(data: string, horario: string) {
  const resultado = new Date(`${data}T${horario}:00-03:00`);
  if (Number.isNaN(resultado.getTime())) {
    throw new ErroGoogleAgenda(
      "A data ou o horário informado é inválido.",
      "DATA_HORA_INVALIDA",
    );
  }
  return resultado;
}

function horarioEstaLivre(
  inicio: Date,
  fim: Date,
  intervalos: IntervaloOcupado[],
) {
  return !intervalos.some((intervalo) => {
    const inicioOcupado = new Date(intervalo.start).getTime();
    const fimOcupado = new Date(intervalo.end).getTime();
    return inicio.getTime() < fimOcupado && fim.getTime() > inicioOcupado;
  });
}

function extrairLinkMeet(evento: EventoGoogle) {
  return (
    evento.hangoutLink ??
    evento.conferenceData?.entryPoints?.find(
      (ponto) => ponto.entryPointType === "video",
    )?.uri
  );
}

function extrairCodigoMeet(linkMeet: string) {
  try {
    const url = new URL(linkMeet);
    if (url.hostname !== "meet.google.com") return null;
    const codigo = url.pathname.replace(/^\/+|\/+$/g, "");
    return /^[a-z]+(?:-[a-z]+){2}$/i.test(codigo) ? codigo : null;
  } catch {
    return null;
  }
}

async function configurarAcessoAbertoMeet(
  emailResponsavel: string,
  linkMeet: string,
) {
  const codigoMeet = extrairCodigoMeet(linkMeet);
  if (!codigoMeet) {
    throw new ErroGoogleAgenda(
      "O Google criou a reunião, mas retornou um link do Meet inválido.",
      "GOOGLE_MEET_LINK_INVALIDO",
    );
  }

  const espaco = await requisicaoGoogle<EspacoGoogleMeet>(emailResponsavel, {
    url: `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(codigoMeet)}`,
    method: "GET",
    escopos: [ESCOPO_CONFIGURACOES_MEET],
  });
  if (!espaco.name?.startsWith("spaces/")) {
    throw new ErroGoogleAgenda(
      "O Google não confirmou o espaço da reunião.",
      "GOOGLE_MEET_ESPACO_NAO_CONFIRMADO",
    );
  }

  const espacoAtualizado = await requisicaoGoogle<EspacoGoogleMeet>(
    emailResponsavel,
    {
      url: `https://meet.googleapis.com/v2/${espaco.name}?updateMask=config.accessType,config.entryPointAccess`,
      method: "PATCH",
      escopos: [ESCOPO_CONFIGURACOES_MEET],
      data: {
        name: espaco.name,
        config: {
          accessType: "OPEN",
          entryPointAccess: "ALL",
        },
      },
    },
  );

  if (
    espacoAtualizado.config?.accessType !== "OPEN" ||
    espacoAtualizado.config?.entryPointAccess !== "ALL"
  ) {
    throw new ErroGoogleAgenda(
      "O Google não confirmou o acesso aberto à reunião.",
      "GOOGLE_MEET_ACESSO_NAO_CONFIRMADO",
    );
  }
}

async function aguardarLinkMeet(
  emailResponsavel: string,
  idEvento: string,
  eventoInicial: EventoGoogle,
) {
  let evento = eventoInicial;

  for (let tentativa = 0; tentativa < 12; tentativa += 1) {
    const linkMeet = extrairLinkMeet(evento);
    if (linkMeet) return linkMeet;

    if (
      evento.conferenceData?.createRequest?.status?.statusCode === "failure"
    ) {
      break;
    }

    await new Promise((resolver) => setTimeout(resolver, 250));
    evento = await requisicaoGoogle<EventoGoogle>(emailResponsavel, {
      url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(idEvento)}`,
      method: "GET",
    });
  }

  throw new ErroGoogleAgenda(
    "O Google criou o evento, mas não confirmou a sala do Google Meet.",
    "GOOGLE_MEET_NAO_CRIADO",
  );
}

async function consultarUsuarioNoDia(usuario: UsuarioAgenda, data: string) {
  const inicio = dataHora(data, "08:00");
  const fim = new Date(
    dataHora(data, "18:00").getTime() + DURACAO_REUNIAO_MINUTOS * 60_000,
  );
  const resposta = await requisicaoGoogle<RespostaDisponibilidade>(
    usuario.email,
    {
      url: "https://www.googleapis.com/calendar/v3/freeBusy",
      method: "POST",
      data: {
        timeMin: inicio.toISOString(),
        timeMax: fim.toISOString(),
        timeZone: FUSO_HORARIO,
        items: [{ id: usuario.email }],
      },
    },
  );

  const calendario =
    resposta.calendars?.[usuario.email] ??
    Object.values(resposta.calendars ?? {})[0];
  if (!calendario || calendario.errors?.length) {
    throw new ErroGoogleAgenda(
      "Não foi possível consultar uma das agendas da equipe.",
      "GOOGLE_AGENDA_INACESSIVEL",
      JSON.stringify(calendario?.errors ?? []),
    );
  }
  return calendario.busy ?? [];
}

export async function consultarDisponibilidadeDia(
  usuarios: UsuarioAgenda[],
  data: string,
) {
  if (usuarios.length === 0) {
    throw new ErroGoogleAgenda(
      "Nenhum usuário da equipe configurada possui um e-mail válido no RD.",
      "GOOGLE_SEM_USUARIOS",
    );
  }

  const consultas = await Promise.all(
    usuarios.map(async (usuario) => {
      try {
        return {
          usuario,
          intervalos: await consultarUsuarioNoDia(usuario, data),
        };
      } catch (erro) {
        console.error("Agenda de um usuário da equipe indisponível.", {
          usuario_rd_id: usuario.id,
          codigo:
            erro instanceof ErroGoogleAgenda ? erro.codigo : "ERRO_DESCONHECIDO",
          detalhes:
            erro instanceof ErroGoogleAgenda ? erro.detalhes : undefined,
        });
        return null;
      }
    }),
  );
  const agendasValidas = consultas.filter(
    (consulta): consulta is NonNullable<typeof consulta> => Boolean(consulta),
  );

  if (agendasValidas.length === 0) {
    throw new ErroGoogleAgenda(
      "Não foi possível consultar as agendas dos Closers.",
      "GOOGLE_NENHUMA_AGENDA_ACESSIVEL",
    );
  }

  const horarioMinimo = Date.now() + ANTECEDENCIA_MINIMA_MINUTOS * 60_000;

  return HORARIOS_AGENDA.map((horario) => {
    const inicio = dataHora(data, horario);
    const fim = new Date(
      inicio.getTime() + DURACAO_REUNIAO_MINUTOS * 60_000,
    );
    return {
      horario,
      responsaveis:
        inicio.getTime() < horarioMinimo
          ? []
          : agendasValidas
              .filter(({ intervalos }) =>
                horarioEstaLivre(inicio, fim, intervalos),
              )
              .map(({ usuario }) => usuario),
    };
  });
}

export async function criarEventoGoogle(dados: {
  responsavel: UsuarioAgenda;
  data: string;
  horario: string;
  nomeEmpresa: string;
  emailsParticipantes: string[];
  descricao: string;
  idIndicacao: number;
}) {
  const inicio = dataHora(dados.data, dados.horario);
  const fim = new Date(
    inicio.getTime() + DURACAO_REUNIAO_MINUTOS * 60_000,
  );
  const emailsParticipantes = Array.from(
    new Set(
      dados.emailsParticipantes
        .map((email) => email.trim().toLocaleLowerCase("pt-BR"))
        .filter(
          (email) =>
            email &&
            email !== dados.responsavel.email.toLocaleLowerCase("pt-BR"),
        ),
    ),
  );
  const evento = await requisicaoGoogle<EventoGoogle>(dados.responsavel.email, {
    url: "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    method: "POST",
    data: {
      summary: `Reunião SST - ${dados.nomeEmpresa}`,
      description: dados.descricao,
      attendees: emailsParticipantes.map((email) => ({ email })),
      start: { dateTime: inicio.toISOString(), timeZone: FUSO_HORARIO },
      end: { dateTime: fim.toISOString(), timeZone: FUSO_HORARIO },
      transparency: "opaque",
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
      extendedProperties: {
        private: {
          origem: ORIGEM_EVENTO,
          indicacao_sst_id: String(dados.idIndicacao),
        },
      },
    },
  });

  if (!evento.id) {
    throw new ErroGoogleAgenda(
      "O Google não confirmou a criação do evento.",
      "GOOGLE_EVENTO_SEM_ID",
    );
  }

  let linkMeet: string;
  try {
    const emailsConfirmados = new Set(
      (evento.attendees ?? [])
        .map((participante) => participante.email?.toLocaleLowerCase("pt-BR"))
        .filter(Boolean),
    );
    const emailAusente = emailsParticipantes.find(
      (email) => !emailsConfirmados.has(email),
    );
    if (emailAusente) {
      throw new ErroGoogleAgenda(
        "O Google criou o evento, mas não confirmou todos os participantes.",
        "GOOGLE_PARTICIPANTE_NAO_INCLUIDO",
      );
    }

    linkMeet = await aguardarLinkMeet(
      dados.responsavel.email,
      evento.id,
      evento,
    );
    await configurarAcessoAbertoMeet(dados.responsavel.email, linkMeet);
  } catch (erro) {
    await requisicaoGoogle<unknown>(dados.responsavel.email, {
      url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(evento.id)}`,
      method: "DELETE",
    }).catch(() => undefined);
    throw erro;
  }

  return {
    id: evento.id,
    link: evento.htmlLink,
    linkMeet,
    emailResponsavel: dados.responsavel.email,
  } satisfies ReservaGoogle;
}

export async function excluirEventoGoogle(reserva: ReservaGoogle) {
  await requisicaoGoogle<unknown>(reserva.emailResponsavel, {
    url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(reserva.id)}`,
    method: "DELETE",
  });
}
