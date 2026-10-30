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

