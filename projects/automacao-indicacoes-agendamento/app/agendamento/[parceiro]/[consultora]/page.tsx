import { notFound } from "next/navigation";
import { FormularioAgendamento } from "../../../formulario-agendamento";

type PropriedadesPagina = {
  params: Promise<{
    parceiro: string;
    consultora: string;
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
  title: "Indicação e agendamento | Programa de Indicações",
  description: "Formulário para indicação de clientes e agendamento de reuniões.",
};

export default async function PaginaAgendamento({ params }: PropriedadesPagina) {
  const parametros = await params;
  const parceiro = separarParceiro(parametros.parceiro);

  if (!parceiro) {
    notFound();
  }

  return (
    <FormularioAgendamento
      operacao={parceiro.operacao}
      idParceiro={parceiro.idParceiro}
      nomeParceiro={parceiro.nomeParceiro}
      consultora={prepararParametro(parametros.consultora)}
    />
  );
}
