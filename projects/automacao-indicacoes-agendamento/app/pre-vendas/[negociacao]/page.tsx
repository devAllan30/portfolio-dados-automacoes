import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioAgendamentoBdr } from "../../formulario-agendamento-bdr";

type Propriedades = { params: Promise<{ negociacao: string }> };

export const metadata: Metadata = {
  title: "Agendamento BDR SST | Quality SST",
  description: "Agendamento de reunião a partir de uma negociação do RD Station.",
};

export default async function PaginaAgendamento({ params }: Propriedades) {
  const { negociacao } = await params;
  const idNegociacao = decodeURIComponent(negociacao).trim().toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(idNegociacao)) notFound();
  return <FormularioAgendamentoBdr idNegociacao={idNegociacao} />;
}
