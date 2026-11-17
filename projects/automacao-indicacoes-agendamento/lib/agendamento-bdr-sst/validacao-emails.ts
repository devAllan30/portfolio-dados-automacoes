export function normalizarEmail(valor: string) {
  return valor.trim().toLocaleLowerCase("pt-BR");
}

export function emailValido(valor: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(valor));
}

export function validarEmailsSelecionados(recebidos: unknown, permitidos: string[]) {
  if (!Array.isArray(recebidos)) throw new Error("Selecione pelo menos um e-mail de contato.");
  const selecionados = Array.from(new Set(recebidos
    .filter((item): item is string => typeof item === "string")
    .map(normalizarEmail)
    .filter(Boolean)));
  if (selecionados.length === 0) throw new Error("Selecione pelo menos um e-mail de contato.");
  const conjuntoPermitidos = new Set(permitidos.map(normalizarEmail));
  if (selecionados.some((email) => !emailValido(email) || !conjuntoPermitidos.has(email))) {
    throw new Error("Foi enviado um e-mail que não pertence aos contatos desta negociação.");
  }
  return selecionados;
}
