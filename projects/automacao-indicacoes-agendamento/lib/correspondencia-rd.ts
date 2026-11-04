type EmpresaComCampos = {
  custom_fields?: Record<string, unknown>;
};

type NegociacaoComVinculos = {
  organization_id?: string;
  pipeline_id?: string;
};

function valoresCampoPersonalizado(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor.flatMap(valoresCampoPersonalizado);
  }

  if (valor && typeof valor === "object") {
    const registro = valor as Record<string, unknown>;
    return "value" in registro
      ? valoresCampoPersonalizado(registro.value)
      : [];
  }

  if (valor === null || valor === undefined) return [];
  return [String(valor).trim()];
}

export function empresaCorrespondeAoIdParceiro(
  empresa: EmpresaComCampos,
  slugCampo: string,
  idParceiro: string,
) {
  const esperado = idParceiro.trim().toLocaleUpperCase("pt-BR");
  return valoresCampoPersonalizado(empresa.custom_fields?.[slugCampo]).some(
    (valor) => valor.toLocaleUpperCase("pt-BR") === esperado,
  );
}

export function negociacaoPertenceEmpresaEFunil(
  negociacao: NegociacaoComVinculos,
  idEmpresa: string,
  idFunil: string,
) {
  return (
    negociacao.organization_id === idEmpresa &&
    negociacao.pipeline_id === idFunil
  );
}
