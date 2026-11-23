export type CustomerDocumentType = "CNPJ" | "CAEPF" | "CPF";

export function isCustomerDocumentType(value: string): value is CustomerDocumentType {
  return value === "CNPJ" || value === "CAEPF" || value === "CPF";
}

function normalizeCnpj(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
}

function cnpjDigit(base: string) {
  let weight = base.length - 7;
  let sum = 0;
  for (const character of base) {
    sum += (character.charCodeAt(0) - 48) * weight;
    weight -= 1;
    if (weight === 1) weight = 9;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const first = cnpjDigit(cnpj.slice(0, 12));
  const second = cnpjDigit(`${cnpj.slice(0, 12)}${first}`);
  return cnpj.endsWith(`${first}${second}`);
}

function normalizeCpf(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function isValidCpf(value: string) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function normalizeCaepf(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

export function normalizeCustomerDocument(value: string, type: CustomerDocumentType) {
  if (type === "CPF") return normalizeCpf(value);
  return type === "CAEPF" ? normalizeCaepf(value) : normalizeCnpj(value);
}

export function formatCustomerDocument(value: string, type: CustomerDocumentType) {
  const document = normalizeCustomerDocument(value, type);
  if (type === "CPF") {
    let formatted = document.slice(0, 3);
    if (document.length > 3) formatted += `.${document.slice(3, 6)}`;
    if (document.length > 6) formatted += `.${document.slice(6, 9)}`;
    if (document.length > 9) formatted += `-${document.slice(9, 11)}`;
    return formatted;
  }
  if (type === "CAEPF") {
    let formatted = document.slice(0, 3);
    if (document.length > 3) formatted += `.${document.slice(3, 6)}`;
    if (document.length > 6) formatted += `.${document.slice(6, 9)}`;
    if (document.length > 9) formatted += `/${document.slice(9, 12)}`;
    if (document.length > 12) formatted += `-${document.slice(12, 14)}`;
    return formatted;
  }
  let formatted = document.slice(0, 2);
  if (document.length > 2) formatted += `.${document.slice(2, 5)}`;
  if (document.length > 5) formatted += `.${document.slice(5, 8)}`;
  if (document.length > 8) formatted += `/${document.slice(8, 12)}`;
  if (document.length > 12) formatted += `-${document.slice(12, 14)}`;
  return formatted;
}

export function isValidCustomerDocument(value: string, type: CustomerDocumentType) {
  if (type === "CPF") return isValidCpf(value);
  if (type === "CAEPF") {
    const document = normalizeCaepf(value);
    return /^\d{14}$/.test(document) && !/^(\d)\1{13}$/.test(document);
  }
  return isValidCnpj(value);
}
