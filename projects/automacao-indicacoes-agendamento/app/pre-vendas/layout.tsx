import type { Metadata } from "next";
import "../agendamento-bdr-sst.css";

export const metadata: Metadata = {
  title: "Agendamento BDR SST | Quality SST",
  description: "Agendamento de reunião a partir de uma negociação do RD Station.",
};

export default function LayoutPreVendas({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
