export function formatarDocumentoParceiro(valor: string) {
  if (/^\d{11}$/.test(valor)) {
    return valor.replace(
      /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
      "$1.$2.$3-$4",
    );
  }

  if (/^\d{14}$/.test(valor)) {
    return valor.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }

  return null;
}
