import {
  cnpjValido,
  formatarCnpj,
  normalizarCnpj,
} from "./validacao-cnpj";

export type TipoDocumentoCliente = "CNPJ" | "CAEPF" | "CPF";

export function tipoDocumentoClienteValido(
  valor: string,
): valor is TipoDocumentoCliente {
  return valor === "CNPJ" || valor === "CAEPF" || valor === "CPF";
}

export function normalizarCpf(valor: string) {
  return valor.replace(/\D/g, "").slice(0, 11);
}

export function formatarCpf(valor: string) {
  const cpf = normalizarCpf(valor);
  let formatado = cpf.slice(0, 3);

  if (cpf.length > 3) formatado += `.${cpf.slice(3, 6)}`;
  if (cpf.length > 6) formatado += `.${cpf.slice(6, 9)}`;
  if (cpf.length > 9) formatado += `-${cpf.slice(9, 11)}`;

  return formatado;
}

export function cpfValido(valor: string) {
  const cpf = normalizarCpf(valor);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (quantidade: number) => {
    let soma = 0;
    for (let indice = 0; indice < quantidade; indice += 1) {
      soma += Number(cpf[indice]) * (quantidade + 1 - indice);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return (
    calcularDigito(9) === Number(cpf[9]) &&
    calcularDigito(10) === Number(cpf[10])
  );
}

export function normalizarCaepf(valor: string) {
  return valor.replace(/\D/g, "").slice(0, 14);
}

export function formatarCaepf(valor: string) {
  const caepf = normalizarCaepf(valor);
  let formatado = caepf.slice(0, 3);

  if (caepf.length > 3) formatado += `.${caepf.slice(3, 6)}`;
  if (caepf.length > 6) formatado += `.${caepf.slice(6, 9)}`;
  if (caepf.length > 9) formatado += `/${caepf.slice(9, 12)}`;
  if (caepf.length > 12) formatado += `-${caepf.slice(12, 14)}`;

  return formatado;
}

export function caepfValido(valor: string) {
  const caepf = normalizarCaepf(valor);
  return /^\d{14}$/.test(caepf) && !/^(\d)\1{13}$/.test(caepf);
}

export function normalizarDocumentoCliente(
  valor: string,
  tipo: TipoDocumentoCliente,
) {
  if (tipo === "CPF") return normalizarCpf(valor);
  return tipo === "CAEPF" ? normalizarCaepf(valor) : normalizarCnpj(valor);
}

export function formatarDocumentoCliente(
  valor: string,
  tipo: TipoDocumentoCliente,
) {
  if (tipo === "CPF") return formatarCpf(valor);
  return tipo === "CAEPF" ? formatarCaepf(valor) : formatarCnpj(valor);
}

export function documentoClienteValido(
  valor: string,
  tipo: TipoDocumentoCliente,
) {
  if (tipo === "CPF") return cpfValido(valor);
  return tipo === "CAEPF" ? caepfValido(valor) : cnpjValido(valor);
}
