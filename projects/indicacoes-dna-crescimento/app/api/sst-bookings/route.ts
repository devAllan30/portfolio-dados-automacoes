import { NextResponse } from "next/server";

import { findConsultantByReference } from "@/lib/consultants";
import {
  calendarAvailability,
  createGoogleEvent,
  deleteGoogleEvent,
  GoogleCalendarError,
  type CalendarUser,
  type GoogleReservation,
} from "@/lib/google-calendar";
import {
  confirmSstBooking,
  countMonthlySstBookings,
  createPendingSstBooking,
  failSstBooking,
} from "@/lib/sst-bookings";
import { listSstClosers } from "@/lib/sst-closers";
import {
  acquireSstCalendarLock,
  confirmSstCalendarLock,
  releaseSstCalendarLock,
} from "@/lib/sst-calendar-lock";
import { validateSstSchedule } from "@/lib/sst-schedule";
import {
  publicRdError,
  rdRequest,
  RdApiError,
  RdConfigurationError,
  SOURCE_PIPELINE_ID,
} from "@/lib/rd";
import {
  createRdContact,
  createRdContactTask,
  createRdMeetingTask,
  createRdSstDeal,
  findLatestOrganizationDealInPipeline,
  getRdDealOption,
  getRdPipelineStage,
  getRdUser,
  RdOAuthError,
  updateRdDealForBooking,
  type RdDealV2,
} from "@/lib/rd-oauth";
import { decideSstDealAction } from "@/lib/sst-deal-validation";

const TRANSCRIPTION_BOT_EMAIL = "meetbot@meetgeek.ai";
const SST_PIPELINE_ID = "678fab56b5999f0014422fe8";
const SST_FIRST_STAGE_ID = "678fab56b5999f0014422fec";
const SST_CAMPAIGN_ID = "69d6684f7c889c00249a8807";
const SST_PRE_SELLER_FIELD_ID = "6878fdd3149ecd001a92e2d1";
const SST_PRE_SELLER_OPTION = "ECOSSISTEMA QUALITYCERT";
const noCacheHeaders = { "Cache-Control": "no-store" };

type Submission = {
  consultantReference?: unknown;
  companyId?: unknown;
  contactName?: unknown;
  phone?: unknown;
  primaryEmail?: unknown;
  date?: unknown;
  time?: unknown;
  additionalEmails?: unknown;
  clientCount?: unknown;
  observations?: unknown;
};

type Deal = {
  id?: string;
  _id?: string;
  name?: string;
  hold?: boolean | null;
  win?: boolean | null;
  deal_pipeline?: { id?: string; _id?: string };
  organization?: { id?: string; _id?: string };
  organization_id?: string;
};

class UnavailableTimeError extends Error {}

let bookingQueue: Promise<void> = Promise.resolve();

function runBookingSerially<T>(operation: () => Promise<T>) {
  const result = bookingQueue.then(operation, operation);
  bookingQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function emailIsValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseSubmission(body: Submission) {
  const consultantReference =
    typeof body.consultantReference === "string"
      ? body.consultantReference.trim()
      : "";
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const contactName =
    typeof body.contactName === "string" ? body.contactName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const primaryEmail =
    typeof body.primaryEmail === "string"
      ? body.primaryEmail.trim().toLocaleLowerCase("pt-BR")
      : "";
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const time = typeof body.time === "string" ? body.time.trim() : "";
  const observations =
    typeof body.observations === "string" ? body.observations.trim() : "";
  const additionalEmails = Array.isArray(body.additionalEmails)
    ? body.additionalEmails
        .filter((item): item is string => typeof item === "string")
        .map((email) => email.trim().toLocaleLowerCase("pt-BR"))
        .filter(Boolean)
    : [];
  const clientCountText =
    typeof body.clientCount === "string" || typeof body.clientCount === "number"
      ? String(body.clientCount).trim()
      : "";
  const clientCount = clientCountText ? Number(clientCountText) : undefined;

  if (!consultantReference) {
    throw new Error("Acesse o formulário pelo link individual de um consultor ativo.");
  }
  if (!/^[a-fA-F0-9]{24}$/.test(companyId)) {
    throw new Error("Selecione uma empresa válida.");
  }
  if (contactName.length < 2 || contactName.length > 180) {
    throw new Error("Informe um contato com pelo menos 2 caracteres.");
  }
  if (!/^\d{10,11}$/.test(phone)) {
    throw new Error("Informe um telefone com DDD e 10 ou 11 dígitos.");
  }
  if (!emailIsValid(primaryEmail)) {
    throw new Error("Informe um e-mail principal válido.");
  }
  if (
    additionalEmails.length > 10 ||
    additionalEmails.some((email) => !emailIsValid(email))
  ) {
    throw new Error("Informe no máximo 10 e-mails adicionais válidos.");
  }
  if (
    clientCount !== undefined &&
    (!Number.isInteger(clientCount) || clientCount <= 0)
  ) {
    throw new Error(
      "A quantidade de clientes deve ser um número inteiro maior que zero.",
    );
  }
  if (observations.length > 5_000) {
    throw new Error("A observação pode ter no máximo 5.000 caracteres.");
  }
  validateSstSchedule(date, time);

  return {
    consultantReference,
    companyId,
    contactName,
    phone,
    primaryEmail,
    date,
    time,
    additionalEmails: Array.from(new Set(additionalEmails)),
    clientCount,
    observations,
  };
}

function balancedCloserOrder(
  closers: CalendarUser[],
  counts: Map<string, number>,
) {
  return [...closers]
    .map((closer) => ({ closer, random: Math.random() }))
    .sort(
      (left, right) =>
        (counts.get(left.closer.id) ?? 0) -
          (counts.get(right.closer.id) ?? 0) ||
        left.random - right.random,
    )
    .map(({ closer }) => closer);
}

function eventDescription(data: {
  companyName: string;
  contactName: string;
  phone: string;
  primaryEmail: string;
  consultantName: string;
  clientCount?: number;
  observations: string;
}) {
  return [
    `Empresa: ${data.companyName}`,
    `Contato: ${data.contactName}`,
    `Telefone: ${data.phone}`,
    `E-mail: ${data.primaryEmail}`,
    `Consultor(a) indicador(a): ${data.consultantName}`,
    data.clientCount ? `Quantidade de clientes: ${data.clientCount}` : "",
    data.observations ? `Observações: ${data.observations}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatSaoPauloDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(value)
    .replace(",", "");
}

function contactAttemptDescription(dueDate: Date, consultantName: string) {
  return [
    "Tentativa de agendamento de reunião pelo time de fidelização Qualitycert.",
    `Data do agendamento: ${formatSaoPauloDateTime(dueDate)}`,
    `Consultor: ${consultantName}`,
    "ENTRAR EM CONTATO",
  ].join("\n");
}

function publicBookingError(error: unknown) {
  if (error instanceof UnavailableTimeError) return error.message;
  if (error instanceof GoogleCalendarError) {
    return "Não foi possível concluir o agendamento no Google Agenda. Tente novamente.";
  }
  if (error instanceof RdConfigurationError || error instanceof RdApiError) {
    return publicRdError(error);
  }
  if (error instanceof RdOAuthError) {
    return "Não foi possível criar a tarefa de reunião no RD Station. Tente novamente.";
  }
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir o agendamento.";
}

export async function POST(request: Request) {
  try {
    const submission = parseSubmission((await request.json()) as Submission);
    const [consultant, company] = await Promise.all([
      findConsultantByReference(submission.consultantReference),
      rdRequest<Deal>(`/deals/${encodeURIComponent(submission.companyId)}`),
    ]);
    const companyPipeline = company.deal_pipeline?.id ?? company.deal_pipeline?._id;
    const companyName = company.name?.trim();
    if (companyPipeline !== SOURCE_PIPELINE_ID || !companyName) {
      throw new Error(
        "A empresa selecionada não pertence ao funil de indicadores.",
      );
    }
    if (company.hold === true || (company.win !== null && company.win !== undefined)) {
      throw new Error("A negociação selecionada não está mais em andamento.");
    }
    const organizationId =
      company.organization?.id ??
      company.organization?._id ??
      company.organization_id;
    if (!organizationId) {
      throw new Error("A negociação selecionada não possui uma empresa vinculada.");
    }

    const existingSstDeal = await findLatestOrganizationDealInPipeline(
      organizationId,
      SST_PIPELINE_ID,
    );
    const existingStage =
      existingSstDeal?.status === "ongoing" && existingSstDeal.stage_id
        ? await getRdPipelineStage(SST_PIPELINE_ID, existingSstDeal.stage_id)
        : null;
    const dealAction = decideSstDealAction(
      existingSstDeal,
      existingStage?.name ?? "",
    );
    if (existingSstDeal) {
      console.info("Negociação SST mais recente selecionada.", {
        dealId: existingSstDeal.id,
        updatedAt: existingSstDeal.updated_at,
        status: existingSstDeal.status,
        stageId: existingSstDeal.stage_id,
      });
    }

    if (dealAction === "partner_already_sst") {
      return NextResponse.json(
        {
          title: "AGENDAMENTO NÃO REALIZADO!",
          message: "PARCEIRO JÁ É SST.",
          code: "PARCEIRO_JA_SST",
        },
        { status: 409, headers: noCacheHeaders },
      );
    }

    if (dealAction === "create_contact_task") {
      const responsibleId = String(existingSstDeal?.owner_id ?? "").trim();
      if (!existingSstDeal?.id || !responsibleId || !existingStage?.name) {
        throw new RdOAuthError(
          "A negociação SST em andamento não possui responsável ou etapa válidos.",
        );
      }
      const responsible = await getRdUser(responsibleId);
      const dueDate = new Date(Date.now() + 10 * 60_000);
      const taskId = await createRdContactTask({
        dealId: existingSstDeal.id,
        dueDateIso: dueDate.toISOString(),
        responsibleId,
        description: contactAttemptDescription(dueDate, consultant.name),
      });
      return NextResponse.json(
        {
          title: "AGENDAMENTO NÃO REALIZADO!",
          message: `JÁ EXISTE UMA NEGOCIAÇÃO EM ANDAMENTO COM O CLOSER ${responsible.name} NA ETAPA ${existingStage.name} PARA ESSE PARCEIRO.`,
          reasons: [
            "TAREFA DE CONTATO CRIADA NO RD CRM",
            "COMUNICAR O COORDENADOR SST",
          ],
          code: "NEGOCIACAO_EM_ANDAMENTO",
          taskId,
          dealId: existingSstDeal.id,
          responsible: responsible.name,
          stage: existingStage.name,
        },
        { status: 409, headers: noCacheHeaders },
      );
    }

    const preSellerField = await getRdDealOption(
      SST_PRE_SELLER_FIELD_ID,
      SST_PRE_SELLER_OPTION,
    );
    const bookingCustomFields = {
      [preSellerField.slug]: preSellerField.value,
    };

    const booking = await runBookingSerially(async () => {
      const closers = await listSstClosers();
      const availability = await calendarAvailability(closers, submission.date);
      const availableClosers =
        availability.find((slot) => slot.time === submission.time)?.availableUsers ?? [];
      if (!availableClosers.length) {
        throw new UnavailableTimeError(
          "O horário selecionado acabou de ficar indisponível. Escolha outro horário.",
        );
      }

      const counts = await countMonthlySstBookings(
        availableClosers.map((closer) => closer.id),
        submission.date,
      );
      let closer: CalendarUser | null = null;
      let calendarLockId: number | null = null;
      for (const candidate of balancedCloserOrder(availableClosers, counts)) {
        const lockId = await acquireSstCalendarLock({
          responsibleId: candidate.id,
          date: submission.date,
          time: submission.time,
          source: "na_pratica",
        });
        if (lockId) {
          closer = candidate;
          calendarLockId = lockId;
          break;
        }
      }
      if (!closer || !calendarLockId) {
        throw new UnavailableTimeError(
          "O horário selecionado acabou de ser reservado. Escolha outro horário.",
        );
      }

      let reservation: GoogleReservation | null = null;
      let bookingId: number | null = null;
      let rdTaskId: string | null = null;
      let targetDeal: RdDealV2 | null = null;
      let contactId: string | undefined;
      try {
        bookingId = await createPendingSstBooking({
          consultantName: consultant.name,
          companyName,
          companyDealId: submission.companyId,
          companyOrganizationId: organizationId,
          contactName: submission.contactName,
          phone: submission.phone,
          primaryEmail: submission.primaryEmail,
          additionalEmails: submission.additionalEmails,
          clientCount: submission.clientCount,
          observations: submission.observations,
          scheduledAt: `${submission.date} ${submission.time}:00`,
          closerId: closer.id,
        });
        reservation = await createGoogleEvent({
          owner: closer,
          date: submission.date,
          time: submission.time,
          companyName,
          participantEmails: [
            submission.primaryEmail,
            ...submission.additionalEmails,
            TRANSCRIPTION_BOT_EMAIL,
          ],
          description: eventDescription({
            companyName,
            contactName: submission.contactName,
            phone: submission.phone,
            primaryEmail: submission.primaryEmail,
            consultantName: consultant.name,
            clientCount: submission.clientCount,
            observations: submission.observations,
          }),
          bookingId,
        });
        await confirmSstCalendarLock({
          lockId: calendarLockId,
          referenceId: bookingId,
          googleEventId: reservation.id,
        });
        contactId = await createRdContact({
          organizationId,
          name: submission.contactName,
          phone: submission.phone,
          email: submission.primaryEmail,
        });
        if (dealAction === "create_new_deal") {
          targetDeal = await createRdSstDeal({
            name: companyName,
            organizationId,
            contactId,
            responsibleId: closer.id,
            stageId: SST_FIRST_STAGE_ID,
            campaignId: SST_CAMPAIGN_ID,
            customFields: bookingCustomFields,
          });
        } else {
          if (!existingSstDeal) {
            throw new RdOAuthError(
              "Não foi possível localizar a negociação SST para retomada.",
            );
          }
          targetDeal = await updateRdDealForBooking({
            deal: existingSstDeal,
            name: companyName,
            organizationId,
            contactId,
            responsibleId: closer.id,
            stageId: SST_FIRST_STAGE_ID,
            campaignId: SST_CAMPAIGN_ID,
            customFields: bookingCustomFields,
          });
        }
        if (!targetDeal?.id) {
          throw new RdOAuthError(
            "Não foi possível definir a negociação SST do agendamento.",
          );
        }
        rdTaskId = await createRdMeetingTask({
          dealId: targetDeal.id,
          dueDateIso: new Date(
            `${submission.date}T${submission.time}:00-03:00`,
          ).toISOString(),
          responsibleId: closer.id,
          description: eventDescription({
            companyName,
            contactName: submission.contactName,
            phone: submission.phone,
            primaryEmail: submission.primaryEmail,
            consultantName: consultant.name,
            clientCount: submission.clientCount,
            observations: submission.observations,
          }),
        });
        await confirmSstBooking(bookingId, reservation, {
          taskId: rdTaskId,
          dealId: targetDeal.id,
          contactId,
        });
      } catch (error) {
        if (reservation) {
          await deleteGoogleEvent(reservation).catch(() => undefined);
        }
        if (bookingId) {
          await failSstBooking(
            bookingId,
            error instanceof Error ? error.message : "Erro desconhecido",
          ).catch(() => undefined);
        }
        await releaseSstCalendarLock(calendarLockId).catch(() => undefined);
        throw error;
      }

      return {
        bookingId,
        closer,
        reservation,
        rdTaskId,
        dealId: targetDeal?.id,
      };
    });

    return NextResponse.json(
      {
        id: booking.bookingId,
        dealId: booking.dealId,
        rdTaskId: booking.rdTaskId,
        message: "Reunião agendada com sucesso.",
        responsible: booking.closer.name,
        eventLink: booking.reservation.eventLink,
        meetLink: booking.reservation.meetLink,
        summary: {
          consultant: consultant.name,
          company: companyName,
          contact: submission.contactName,
          phone: submission.phone,
          primaryEmail: submission.primaryEmail,
          date: submission.date,
          time: submission.time,
        },
      },
      { headers: noCacheHeaders },
    );
  } catch (error) {
    console.error("Erro ao agendar indicação SST.", {
      code: error instanceof GoogleCalendarError ? error.code : null,
      message: error instanceof Error ? error.message : "Erro desconhecido",
    });
    const integrationError =
      error instanceof GoogleCalendarError ||
      error instanceof RdConfigurationError ||
      error instanceof RdApiError ||
      error instanceof RdOAuthError;
    const status = error instanceof UnavailableTimeError ? 409 : integrationError ? 502 : 400;
    return NextResponse.json(
      { message: publicBookingError(error) },
      { status, headers: noCacheHeaders },
    );
  }
}
