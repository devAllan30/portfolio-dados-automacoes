"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dataEhFimDeSemana } from "../lib/data-agendamento";

type PropriedadesCalendario = {
  value: string;
  min: string;
  onChange: (data: string) => void;
};

const NOMES_DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function converterData(valor: string) {
  const [ano, mes, dia] = valor.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function formatarData(data: Date) {
  return data.toISOString().slice(0, 10);
}

function adicionarDias(valor: string, quantidade: number) {
  const data = converterData(valor);
  data.setUTCDate(data.getUTCDate() + quantidade);
  return formatarData(data);
}

function inicioDoMes(valor: string) {
  const data = converterData(valor);
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function mudarMes(valor: string, quantidade: number) {
  const data = converterData(valor);
  data.setUTCMonth(data.getUTCMonth() + quantidade, 1);
  return formatarData(data);
}

export function CalendarioDataReuniao({
  value,
  min,
  onChange,
}: PropriedadesCalendario) {
  const max = useMemo(() => adicionarDias(min, 364), [min]);
  const primeiroMes = inicioDoMes(min);
  const ultimoMes = inicioDoMes(max);
  const [mesVisivel, setMesVisivel] = useState(() =>
    inicioDoMes(value || min),
  );
  const [aberto, setAberto] = useState(false);
  const referencia = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fecharAoClicarFora(evento: MouseEvent) {
      if (!referencia.current?.contains(evento.target as Node)) setAberto(false);
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }

    document.addEventListener("mousedown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.removeEventListener("mousedown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, []);

  const dias = useMemo(() => {
    const primeiroDia = converterData(mesVisivel);
    const inicioGrade = new Date(primeiroDia);
    inicioGrade.setUTCDate(primeiroDia.getUTCDate() - primeiroDia.getUTCDay());

    return Array.from({ length: 42 }, (_, indice) => {
      const data = new Date(inicioGrade);
      data.setUTCDate(inicioGrade.getUTCDate() + indice);
      const valor = formatarData(data);
      const foraDoMes = data.getUTCMonth() !== primeiroDia.getUTCMonth();
      const indisponivel =
        foraDoMes || valor < min || valor > max || dataEhFimDeSemana(valor);

      return {
        valor,
        dia: data.getUTCDate(),
        foraDoMes,
        indisponivel,
        descricao: new Intl.DateTimeFormat("pt-BR", {
          timeZone: "UTC",
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        }).format(data),
      };
    });
  }, [max, mesVisivel, min]);

  const tituloMes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(converterData(mesVisivel));

  const dataSelecionada = value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        converterData(value),
      )
    : "Selecionar data";

  return (
    <div className="seletor-calendario" ref={referencia}>
      <button
        type="button"
        className={`botao-abrir-calendario${value ? " preenchido" : ""}`}
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        aria-controls="calendario-data-reuniao"
      >
        <span aria-hidden="true" className="icone-calendario">▦</span>
        <span>{dataSelecionada}</span>
        <span aria-hidden="true" className="seta-calendario">⌄</span>
      </button>

      {aberto && (
        <div
          id="calendario-data-reuniao"
          className="calendario-reuniao"
          aria-labelledby="rotulo-data-reuniao"
          tabIndex={-1}
        >
          <div className="calendario-cabecalho">
            <button
              type="button"
              className="calendario-navegacao"
              onClick={() => setMesVisivel((atual) => mudarMes(atual, -1))}
              disabled={mesVisivel <= primeiroMes}
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <strong>{tituloMes.charAt(0).toUpperCase() + tituloMes.slice(1)}</strong>
            <button
              type="button"
              className="calendario-navegacao"
              onClick={() => setMesVisivel((atual) => mudarMes(atual, 1))}
              disabled={mesVisivel >= ultimoMes}
              aria-label="Próximo mês"
            >
              ›
            </button>
          </div>

          <div className="calendario-grade" role="grid" aria-label="Datas disponíveis">
            {NOMES_DIAS.map((nome, indice) => (
              <span
                key={nome}
                className={indice === 0 || indice === 6 ? "fim-de-semana" : ""}
                role="columnheader"
              >
                {nome}
              </span>
            ))}
            {dias.map((data) => (
              <button
                key={data.valor}
                type="button"
                className={[
                  "calendario-dia",
                  data.foraDoMes ? "fora-do-mes" : "",
                  data.indisponivel ? "indisponivel" : "",
                  value === data.valor ? "selecionado" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={data.indisponivel}
                onClick={() => {
                  onChange(data.valor);
                  setAberto(false);
                }}
                aria-label={data.descricao}
                aria-selected={value === data.valor}
                role="gridcell"
              >
                {data.dia}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
