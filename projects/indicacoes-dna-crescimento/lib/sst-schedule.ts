export const SST_TIME_ZONE = "America/Sao_Paulo";
export const SST_SCHEDULE_DAYS = 365;
export const SST_MEETING_DURATION_MINUTES = 30;
export const SST_MINIMUM_NOTICE_MINUTES = 15;

const SST_FIRST_SLOT_MINUTES = 8 * 60 + 30;
const SST_LAST_SLOT_MINUTES = 17 * 60 + 30;
const SST_SLOT_INTERVAL_MINUTES = 30;

export type SstDateOption = { value: string; label: string };
export type SstTimeOption = { value: string; label: string };

const saoPauloPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const dateLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function getSaoPauloParts(date: Date) {
  const parts = Object.fromEntries(
    saoPauloPartsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function dateKeyFromUtcDate(date: Date) {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function todayKey(now: Date) {
  const parts = getSaoPauloParts(now);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function formatDateLabel(date: Date) {
  const label = dateLabelFormatter.format(date);
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function isWeekday(date: Date) {
  const weekday = date.getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

function timeValue(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function getSstDateOptions(now = new Date()): SstDateOption[] {
  const current = getSaoPauloParts(now);
  const firstDate = new Date(Date.UTC(current.year, current.month - 1, current.day, 12));
  const dates: SstDateOption[] = [];

  for (let offset = 0; offset < SST_SCHEDULE_DAYS; offset += 1) {
    const date = new Date(firstDate);
    date.setUTCDate(firstDate.getUTCDate() + offset);
    if (!isWeekday(date)) continue;
    dates.push({ value: dateKeyFromUtcDate(date), label: formatDateLabel(date) });
  }

  return dates;
}

export function getSstTimeOptions(dateValue: string, now = new Date()): SstTimeOption[] {
  const date = getSstDateOptions(now).find((option) => option.value === dateValue);
  if (!date) {
    throw new Error("Selecione uma data válida entre segunda e sexta-feira nos próximos 365 dias.");
  }

  const current = getSaoPauloParts(now);
  const currentSeconds = current.hour * 3600 + current.minute * 60 + current.second;
  const minimumStartSeconds = currentSeconds + SST_MINIMUM_NOTICE_MINUTES * 60;
  const isToday = dateValue === todayKey(now);
  const times: SstTimeOption[] = [];

  for (
    let minutes = SST_FIRST_SLOT_MINUTES;
    minutes <= SST_LAST_SLOT_MINUTES;
    minutes += SST_SLOT_INTERVAL_MINUTES
  ) {
    if (isToday && minutes * 60 < minimumStartSeconds) continue;
    const value = timeValue(minutes);
    times.push({ value, label: value });
  }

  return times;
}

export function validateSstSchedule(dateValue: string, time: string, now = new Date()) {
  const date = getSstDateOptions(now).find((option) => option.value === dateValue);
  if (!date) {
    throw new Error("A data deve ser um dia útil dentro dos próximos 365 dias.");
  }
  const availableTime = getSstTimeOptions(dateValue, now).find((option) => option.value === time);
  if (!availableTime) {
    throw new Error("O horário não está disponível ou não respeita a antecedência mínima de 15 minutos.");
  }

  return {
    date,
    time: availableTime,
    timeZone: SST_TIME_ZONE,
    meetingDurationMinutes: SST_MEETING_DURATION_MINUTES,
    minimumNoticeMinutes: SST_MINIMUM_NOTICE_MINUTES,
  };
}
