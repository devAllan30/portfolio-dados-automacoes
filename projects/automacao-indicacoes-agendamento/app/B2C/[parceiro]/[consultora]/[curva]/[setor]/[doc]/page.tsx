import { notFound } from "next/navigation";
import { FormularioIndicacao } from "../../../../../../formulario-indicacao";

type PropriedadesPagina = {
  params: Promise<{
    parceiro: string;
    consultora: string;
    curva: string;
    setor: string;
    doc: string;
  }>;
};

function prepararParametro(valor: string) {
  return decodeURIComponent(valor).trim();
}

function separarParceiro(valor: string) {
  const parametro = prepararParametro(valor);
  const posicaoSeparador = parametro.indexOf("=");

  if (posicaoSeparador <= 0 || posicaoSeparador === parametro.length - 1) {
    return null;
  }

  const idParceiro = parametro.slice(0, posicaoSeparador).trim();
  const siglaBanco = idParceiro.match(/_([DQ])$/i)?.[1]?.toUpperCase();

  if (!siglaBanco) {
    return null;
  }

  return {
    idParceiro,
    nomeParceiro: parametro
      .slice(posicaoSeparador + 1)
      .replace(/\$/g, "/")
      .replace(/~/g, "+")
      .trim(),
    operacao: siglaBanco === "D" ? "Operação D" : "Operação Q",
  };
}

export const metadata = {
  title: "Programa de Indicações B2C",
  description: "Formulário B2C do programa de indicações.",
};

export default async function PaginaIndicacaoB2C({
  params,
}: PropriedadesPagina) {
  const parametros = await params;
  const parceiro = separarParceiro(parametros.parceiro);
  const consultora = prepararParametro(parametros.consultora);
  const curva = prepararParametro(parametros.curva);
  const setor = prepararParametro(parametros.setor);
  const documentoParceiro = prepararParametro(parametros.doc);

  if (
    !parceiro ||
    !consultora ||
    !curva ||
    !setor ||
    !/^\d{11}(?:\d{3})?$/.test(documentoParceiro)
  ) {
    notFound();
  }

  return (
    <FormularioIndicacao
      operacao={parceiro.operacao}
      idParceiro={parceiro.idParceiro}
      nomeParceiro={parceiro.nomeParceiro}
      consultora={consultora}
    />
  );
}
