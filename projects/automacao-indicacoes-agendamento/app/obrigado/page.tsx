"use client";

import { useEffect, useState } from "react";
import {
  ConfirmacaoIndicacao,
  type ResumoIndicacao,
} from "../confirmacao-indicacao";
import {
  ConfirmacaoAgendamento,
  type ResumoAgendamento,
} from "../confirmacao-agendamento";

export default function PaginaObrigado() {
  const [resumo, setResumo] = useState<ResumoIndicacao | null>(null);
  const [resumoAgendamento, setResumoAgendamento] =
    useState<ResumoAgendamento | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      const salvo = sessionStorage.getItem("indicacao_sst_confirmada");
      const agendamentoSalvo = sessionStorage.getItem(
        "agendamento_sst_confirmado",
      );

      if (agendamentoSalvo) {
        try {
          setResumoAgendamento(
            JSON.parse(agendamentoSalvo) as ResumoAgendamento,
          );
        } catch {
          sessionStorage.removeItem("agendamento_sst_confirmado");
        }
      } else if (salvo) {
        try {
          setResumo(JSON.parse(salvo) as ResumoIndicacao);
        } catch {
          sessionStorage.removeItem("indicacao_sst_confirmada");
        }
      }
      setCarregado(true);
    }, 0);

    return () => window.clearTimeout(temporizador);
  }, []);

  if (!carregado) {
    return <main className="pagina-agradecimento" aria-busy="true" />;
  }

  if (resumoAgendamento) {
    return <ConfirmacaoAgendamento resumo={resumoAgendamento} />;
  }

  if (!resumo) {
    return (
      <main className="pagina-agradecimento">
        <section className="cartao-agradecimento resumo-indisponivel">
          <span className="marca-texto">Programa de Indicações</span>
          <div className="icone-aviso" aria-hidden="true">!</div>
          <h1>Confirmação indisponível</h1>
          <p>
            Esta página é exibida somente após o envio de uma indicação ou
            agendamento.
          </p>
        </section>
      </main>
    );
  }

  return <ConfirmacaoIndicacao resumo={resumo} />;
}
