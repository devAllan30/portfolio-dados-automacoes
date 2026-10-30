const PROTECTED_SST_STAGES = new Set(
  [
    "Reunião Agendada",
    "Proposta Apresentada",
    "Aguardando Indicações",
    "Indicou Cliente",
    "Aguardando Start",
  ].map(normalizeStageName),
);

export type SstDealAction =
  | "create_new_deal"
  | "use_existing_deal"
  | "partner_already_sst"
  | "create_contact_task";

export function normalizeStageName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function decideSstDealAction(
  deal: { status?: "ongoing" | "won" | "lost" | "paused" } | null,
  stageName = "",
): SstDealAction {
  if (!deal) return "create_new_deal";
  if (deal.status === "won") return "partner_already_sst";
  if (
    deal.status === "ongoing" &&
    PROTECTED_SST_STAGES.has(normalizeStageName(stageName))
  ) {
    return "create_contact_task";
  }
  return "use_existing_deal";
}
