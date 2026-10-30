const ETAPAS_COM_NEGOCIACAO_EM_ANDAMENTO = new Set(
  [
    "Reunião Agendada",
    "Proposta Apresentada",
    "Aguardando Indicações",
    "Indicou Cliente",
    "Aguardando Start",
  ].map(normalizarNomeEtapa),
);

export type AcaoNegociacaoAgendamento =
  | "continuar_agendamento"
  | "parceiro_ja_sst"
  | "criar_tarefa_contato";

export function normalizarNomeEtapa(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function decidirAcaoNegociacaoAgendamento(
  negociacao: { status?: "ongoing" | "won" | "lost" | "paused" },
  nomeEtapa = "",
): AcaoNegociacaoAgendamento {
  if (negociacao.status === "won") return "parceiro_ja_sst";

  if (
    negociacao.status === "ongoing" &&
    ETAPAS_COM_NEGOCIACAO_EM_ANDAMENTO.has(normalizarNomeEtapa(nomeEtapa))
  ) {
    return "criar_tarefa_contato";
  }

  return "continuar_agendamento";
}

