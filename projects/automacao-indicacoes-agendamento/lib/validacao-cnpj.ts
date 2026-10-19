export function normalizarCnpj(valor: string) {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
}

export function formatarCnpj(valor: string) {
  const cnpj = normalizarCnpj(valor);
  let formatado = cnpj.slice(0, 2);

  if (cnpj.length > 2) formatado += `.${cnpj.slice(2, 5)}`;
  if (cnpj.length > 5) formatado += `.${cnpj.slice(5, 8)}`;
  if (cnpj.length > 8) formatado += `/${cnpj.slice(8, 12)}`;
  if (cnpj.length > 12) formatado += `-${cnpj.slice(12, 14)}`;

  return formatado;
}

function calcularDigitoVerificador(base: string) {
  let peso = base.length - 7;
  let soma = 0;

  for (const caractere of base) {
    soma += (caractere.charCodeAt(0) - 48) * peso;
    peso -= 1;
    if (peso === 1) peso = 9;
  }

  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string) {
  const cnpj = normalizarCnpj(valor);

  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;

  const primeiroDigito = calcularDigitoVerificador(cnpj.slice(0, 12));
  const segundoDigito = calcularDigitoVerificador(
    `${cnpj.slice(0, 12)}${primeiroDigito}`,
  );

  return cnpj.endsWith(`${primeiroDigito}${segundoDigito}`);
}
