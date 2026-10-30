import { NextResponse } from "next/server";

import {
  calendarAvailability,
  GoogleCalendarError,
} from "@/lib/google-calendar";
import { publicRdError, RdApiError, RdConfigurationError } from "@/lib/rd";
import { listSstClosers } from "@/lib/sst-closers";
import {
  getSstDateOptions,
  getSstTimeOptions,
  SST_MEETING_DURATION_MINUTES,
  SST_MINIMUM_NOTICE_MINUTES,
  SST_SCHEDULE_DAYS,
  SST_TIME_ZONE,
  validateSstSchedule,
} from "@/lib/sst-schedule";

const responseHeaders = { "Cache-Control": "no-store" };

function scheduleMetadata() {
  return {
    timeZone: SST_TIME_ZONE,
    scheduleDays: SST_SCHEDULE_DAYS,
    meetingDurationMinutes: SST_MEETING_DURATION_MINUTES,
    minimumNoticeMinutes: SST_MINIMUM_NOTICE_MINUTES,
  };
}

async function availableTimes(date: string) {
  const validTimes = new Set(getSstTimeOptions(date).map((option) => option.value));
  const availability = await calendarAvailability(await listSstClosers(), date);
  return availability
    .filter(
      (slot) => validTimes.has(slot.time) && slot.availableUsers.length > 0,
    )
    .map((slot) => ({ value: slot.time, label: slot.time }));
}

function publicAvailabilityError(error: unknown) {
  if (error instanceof GoogleCalendarError) {
    return "Não foi possível consultar as agendas dos Closers neste momento.";
  }
  if (error instanceof RdConfigurationError || error instanceof RdApiError) {
    return publicRdError(error);
  }
  return error instanceof Error
    ? error.message
    : "Não foi possível carregar os horários.";
}

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date")?.trim();
    if (date) {
      return NextResponse.json(
        { ...scheduleMetadata(), date, times: await availableTimes(date) },
        { headers: responseHeaders },
      );
    }
    return NextResponse.json(
      { ...scheduleMetadata(), dates: getSstDateOptions() },
      { headers: responseHeaders },
    );
  } catch (error) {
    const integrationError =
      error instanceof GoogleCalendarError ||
      error instanceof RdConfigurationError ||
      error instanceof RdApiError;
    return NextResponse.json(
      { message: publicAvailabilityError(error) },
      { status: integrationError ? 502 : 400, headers: responseHeaders },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { date?: unknown; time?: unknown };
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const time = typeof body.time === "string" ? body.time.trim() : "";
    const schedule = validateSstSchedule(date, time);
    const times = await availableTimes(date);
    if (!times.some((option) => option.value === time)) {
      throw new Error("O horário selecionado não está mais disponível.");
    }
    return NextResponse.json(
      { valid: true, schedule },
      { headers: responseHeaders },
    );
  } catch (error) {
    const integrationError =
      error instanceof GoogleCalendarError ||
      error instanceof RdConfigurationError ||
      error instanceof RdApiError;
    return NextResponse.json(
      { valid: false, message: publicAvailabilityError(error) },
      { status: integrationError ? 502 : 400, headers: responseHeaders },
    );
  }
}
