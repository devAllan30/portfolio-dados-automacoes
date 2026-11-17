"use client";

import { useState } from "react";

export default function PaginaEntradaPreVendas() {
  const [idNegociacao, setIdNegociacao] = useState("");
  const [erro, setErro] = useState("");

  function abrirFormulario(evento: React.FormEvent) {
    evento.preventDefault();
    const id = idNegociacao.trim().toLowerCase();
    if (!/^[0-9a-f]{24}$/.test(id)) {
      setErro("Informe um ID de negociação válido com 24 caracteres.");
      return;
    }
    window.location.assign(`/pre-vendas/${id}`);
  }

  return (
    <main className="pagina-bdr-sst entrada-bdr-sst">
      <header className="cabecalho-bdr">
        <div className="marca-bdr">
          <span>Q</span>
          <div><strong>Quality SST</strong><small>Agendamento BDR</small></div>
        </div>
        <div className="seguro-bdr">Ambiente local de testes</div>
      </header>

      <form className="cartao-bdr painel-entrada-bdr" onSubmit={abrirFormulario}>
        <p className="sobretitulo-bdr">Agendamento de reunião SST</p>
        <h1>Abrir negociação</h1>
        <p className="descricao-entrada-bdr">
          Informe o ID de uma negociação do funil SST para carregar os dados
          diretamente do RD Station.
        </p>
        <label className="campo-id-bdr">
          <span>ID da negociação</span>
          <input
            autoFocus
            value={idNegociacao}
            onChange={(evento) => {
              setIdNegociacao(evento.target.value);
              setErro("");
            }}
            placeholder="Ex.: 678fab56b5999f0014422fea"
            maxLength={24}
            autoComplete="off"
          />
        </label>
        {erro && <div className="alerta-bdr" role="alert">{erro}</div>}
        <button className="botao-principal-bdr" type="submit">Carregar negociação</button>
        <p className="rodape-formulario-bdr">
          Em produção, este ID será preenchido automaticamente pelo link salvo no RD.
        </p>
      </form>
    </main>
  );
}
