function converterDataCivil(valor: string) {
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!correspondencia) return null;

  const ano = Number(correspondencia[1]);
  const mes = Number(correspondencia[2]);
  const dia = Number(correspondencia[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }

  return data;
}

export function dataAgendamentoValida(valor: string) {
  return Boolean(converterDataCivil(valor));
}

export function dataEhFimDeSemana(valor: string) {
  const data = converterDataCivil(valor);
  if (!data) return false;

  const diaDaSemana = data.getUTCDay();
  return diaDaSemana === 0 || diaDaSemana === 6;
}

export function dataHoraAgendamento(
  data: string,
  horario: string,
) {
  if (!dataAgendamentoValida(data) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) {
    return null;
  }

  const resultado = new Date(`${data}T${horario}:00-03:00`);
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

export function formatarDataHoraRd(data: Date) {
  if (Number.isNaN(data.getTime())) return null;

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";
  const fuso = valor("timeZoneName").replace(/^GMT/, "") || "+00:00";

  return `${valor("year")}-${valor("month")}-${valor("day")}T${valor("hour")}:${valor("minute")}:${valor("second")}.000${fuso}`;
}

