"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ConfirmacaoAgendamento,
  type ResumoAgendamento,
} from "./confirmacao-agendamento";
import { formatarDocumentoParceiro } from "../lib/documento-parceiro";

type PropriedadesFormularioAgendamento = {
  operacao: string;
  idParceiro: string;
  nomeParceiro: string;
  consultora: string;
  curva?: string;
  setor?: string;
  documentoParceiro?: string;
};

type DadosAgendamento = {
  nome_empresa: string;
  nome_contato: string;
  telefone_contato: string;
  email_contato: string;
  quantidade_clientes: string;
  data_reuniao: string;
  horario_reuniao: string;
  observacao: string;
};

const dadosIniciais: DadosAgendamento = {
  nome_empresa: "",
  nome_contato: "",
  telefone_contato: "",
  email_contato: "",
  quantidade_clientes: "",
  data_reuniao: "",
  horario_reuniao: "",
  observacao: "",
};

function obterDataAtualBrasil() {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function aplicarMascaraTelefone(valor: string) {
  const numeros = valor.replace(/\D/g, "").slice(0, 11);

  if (numeros.length <= 2) return numeros ? `(${numeros}` : "";
  if (numeros.length <= 6) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
  }
  if (numeros.length <= 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }
  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
}

export function FormularioAgendamento({
  operacao,
  idParceiro,
  nomeParceiro,
  consultora,
  curva = "",
  setor = "",
  documentoParceiro = "",
}: PropriedadesFormularioAgendamento) {
  const idParceiroExibicao = idParceiro.replace(/_[DQ]$/i, "");
  const documentoParceiroExibicao =
    formatarDocumentoParceiro(documentoParceiro) ?? documentoParceiro;
  const [dataMinima] = useState(obterDataAtualBrasil);
  const [dados, setDados] = useState(dadosIniciais);
  const [enviando, setEnviando] = useState(false);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [horariosDisponiveis, setHorariosDisponiveis] = useState<string[]>([]);
  const [mensagemHorarios, setMensagemHorarios] = useState("");
  const [confirmacao, setConfirmacao] = useState<ResumoAgendamento | null>(null);
  const [mensagemErro, setMensagemErro] = useState("");
  const [motivosErro, setMotivosErro] = useState<string[]>([]);
  const [emailsSecundarios, setEmailsSecundarios] = useState<string[]>([]);

  const contexto = useMemo(
    () => ({
      id_parceiro: idParceiro,
      nome_parceiro: nomeParceiro,
      operacao,
      consultora,
      curva,
      setor,
      documento_parceiro: documentoParceiro,
    }),
    [
      idParceiro,
      nomeParceiro,
      operacao,
      consultora,
      curva,
      setor,
      documentoParceiro,
    ],
  );

  useEffect(() => {
    if (!dados.data_reuniao) return;

    const controlador = new AbortController();

    async function carregarHorarios() {
      setCarregandoHorarios(true);
      setMensagemHorarios("");
      setHorariosDisponiveis([]);
      try {
        const resposta = await fetch(
          `/api/agendamentos?data=${encodeURIComponent(dados.data_reuniao)}`,
          {
          cache: "no-store",
          signal: controlador.signal,
          },
        );
        const resultado = (await resposta.json()) as {
          horarios?: string[];
          mensagem?: string;
        };

        if (!resposta.ok) {
          throw new Error(
            resultado.mensagem ?? "Não foi possível consultar os horários.",
          );
        }

        const horarios = resultado.horarios ?? [];
        setHorariosDisponiveis(horarios);
        if (horarios.length === 0) {
          setMensagemHorarios(
            "Não há Closers disponíveis nesta data. Escolha outra data.",
          );
        }
      } catch (erro) {
        if (controlador.signal.aborted) return;
        setMensagemHorarios(
          erro instanceof Error
            ? erro.message
            : "Não foi possível consultar os horários.",
        );
      } finally {
        if (!controlador.signal.aborted) setCarregandoHorarios(false);
      }
    }

    carregarHorarios();
    return () => controlador.abort();
  }, [dados.data_reuniao]);

  function atualizarCampo(nome: keyof DadosAgendamento, valor: string) {
    setMensagemErro("");
    setMotivosErro([]);
    if (nome === "data_reuniao") {
      setHorariosDisponiveis([]);
      setMensagemHorarios("");
      setCarregandoHorarios(Boolean(valor));
    }
    setDados((atual) => ({
      ...atual,
      [nome]: valor,
      ...(nome === "data_reuniao" ? { horario_reuniao: "" } : {}),
    }));
  }

  function adicionarEmailSecundario() {
    setMensagemErro("");
    setEmailsSecundarios((atuais) =>
      atuais.length >= 10 ? atuais : [...atuais, ""],
    );
  }

  function atualizarEmailSecundario(indice: number, valor: string) {
    setMensagemErro("");
    setEmailsSecundarios((atuais) =>
      atuais.map((email, posicao) => (posicao === indice ? valor : email)),
    );
  }

  function removerEmailSecundario(indice: number) {
    setMensagemErro("");
    setEmailsSecundarios((atuais) =>
      atuais.filter((_, posicao) => posicao !== indice),
    );
  }

  async function enviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const numerosTelefone = dados.telefone_contato.replace(/\D/g, "");
    if (![10, 11].includes(numerosTelefone.length)) {
      evento.currentTarget.telefone_contato.setCustomValidity(
        "Informe um telefone fixo ou celular com DDD.",
      );
      evento.currentTarget.telefone_contato.reportValidity();
      return;
    }

    evento.currentTarget.telefone_contato.setCustomValidity("");
    setEnviando(true);
    setMensagemErro("");
    setMotivosErro([]);

    try {
      const resposta = await fetch("/api/agendamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contexto,
          ...dados,
          emails_secundarios: emailsSecundarios
            .map((email) => email.trim())
            .filter(Boolean),
        }),
      });
      const resultado = (await resposta.json()) as {
        mensagem?: string;
        motivos?: string[];
        empresa_criada?: boolean;
        negociacao_criada?: boolean;
        empresa_id?: string;
        negociacao_id?: string;
        tarefa_id?: string;
        responsavel?: string;
        evento_google_id?: string;
        evento_google_link?: string;
        evento_google_meet_link?: string;
      };

      if (!resposta.ok) {
        setMotivosErro(Array.isArray(resultado.motivos) ? resultado.motivos : []);
        setMensagemErro(
          resultado.mensagem ??
            "Não foi possível concluir o agendamento. Tente novamente.",
        );
        return;
      }

      const resumo: ResumoAgendamento = {
        id_parceiro: idParceiroExibicao,
        nome_parceiro: nomeParceiro,
        operacao,
        consultora,
        curva,
        setor,
        documento_parceiro: documentoParceiroExibicao,
        nome_negociacao: dados.nome_empresa,
        nome_empresa: dados.nome_empresa,
        nome_contato: dados.nome_contato,
        telefone_contato: dados.telefone_contato,
        email_contato: dados.email_contato,
        emails_secundarios: emailsSecundarios
          .map((email) => email.trim())
          .filter(Boolean),
        quantidade_clientes: dados.quantidade_clientes,
        responsavel: resultado.responsavel ?? "Não informado",
        data_reuniao: dados.data_reuniao,
        horario_reuniao: dados.horario_reuniao,
        observacao: dados.observacao,
        empresa_criada: resultado.empresa_criada,
        negociacao_criada: resultado.negociacao_criada,
        empresa_id: resultado.empresa_id,
        negociacao_id: resultado.negociacao_id,
        tarefa_id: resultado.tarefa_id,
        evento_google_id: resultado.evento_google_id,
        evento_google_link: resultado.evento_google_link,
        evento_google_meet_link: resultado.evento_google_meet_link,
        data_hora_envio: new Date().toISOString(),
      };
      sessionStorage.removeItem("indicacao_sst_confirmada");
      sessionStorage.setItem(
        "agendamento_sst_confirmado",
        JSON.stringify(resumo),
      );
      setConfirmacao(resumo);
      window.history.replaceState(window.history.state, "", "/obrigado");
    } catch {
      setMotivosErro([]);
      setMensagemErro(
        "Não foi possível conectar ao serviço de agendamentos. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (confirmacao) {
    return <ConfirmacaoAgendamento resumo={confirmacao} />;
  }

  return (
    <main className="pagina-formulario">
      <div className="fundo-decorativo fundo-um" aria-hidden="true" />
      <div className="fundo-decorativo fundo-dois" aria-hidden="true" />

      <div className="conteudo-formulario">
        <header className="cabecalho">
          <div className="marca">
            <span className="simbolo-marca" aria-hidden="true">Q</span>
            <div>
              <strong>Programa de Indicações</strong>
              <span>Indicação e Agendamento</span>
            </div>
          </div>
          <span className="selo-seguro">Ambiente seguro</span>
        </header>

        <section className="introducao">
          <span className="etiqueta">Agende uma reunião</span>
          <p>
            Informe os dados do contato e escolha a melhor data para a reunião
            com nossa equipe.
          </p>
        </section>

        <section className="cartao-formulario" aria-labelledby="titulo-agendamento">
          <div className="topo-cartao">
            <div>
              <span className="numero-etapa">01</span>
              <div>
                <h2 id="titulo-agendamento">Dados do parceiro e da reunião</h2>
                <p>Os campos com asterisco são obrigatórios.</p>
              </div>
            </div>
            <span className="status-contexto">Parceiro identificado</span>
          </div>

          <div className="contexto-indicacao" aria-label="Informações do link">
            <label>
              <span>ID do parceiro</span>
              <input value={idParceiroExibicao} readOnly aria-readonly="true" />
            </label>
            <label>
              <span>Operação</span>
              <input value={operacao} readOnly aria-readonly="true" />
            </label>
            <label>
              <span>Consultor(a)</span>
              <input value={consultora} readOnly aria-readonly="true" />
            </label>
            {curva && (
              <label>
                <span>Curva</span>
                <input value={curva} readOnly aria-readonly="true" />
              </label>
            )}
            {setor && (
              <label>
                <span>Setor</span>
                <input value={setor} readOnly aria-readonly="true" />
              </label>
            )}
            {documentoParceiro && (
              <label>
                <span>CPF/CNPJ do parceiro</span>
                <input
                  value={documentoParceiroExibicao}
                  readOnly
                  aria-readonly="true"
                />
              </label>
            )}
          </div>

          <div className="divisor">
            <span>Dados do parceiro</span>
          </div>

          <form onSubmit={enviarFormulario} className="campos-editaveis">
            <label className="campo campo-largo">
              <span>Nome da empresa <b>*</b></span>
              <input
                name="nome_empresa"
                value={dados.nome_empresa}
                onChange={(evento) =>
                  atualizarCampo("nome_empresa", evento.target.value)
                }
                placeholder="Nome da empresa que participará da reunião"
                minLength={2}
                maxLength={255}
                required
              />
            </label>

            <label className="campo">
              <span>Nome do contato <b>*</b></span>
              <input
                name="nome_contato"
                value={dados.nome_contato}
                onChange={(evento) => atualizarCampo("nome_contato", evento.target.value)}
                placeholder="Nome completo"
                minLength={2}
                required
              />
            </label>

            <label className="campo">
              <span>Telefone do contato <b>*</b></span>
              <input
                name="telefone_contato"
                value={dados.telefone_contato}
                onChange={(evento) => {
                  evento.target.setCustomValidity("");
                  atualizarCampo(
                    "telefone_contato",
                    aplicarMascaraTelefone(evento.target.value),
                  );
                }}
                placeholder="(31) 3333-4444 ou (31) 99999-9999"
                inputMode="numeric"
                maxLength={15}
                required
              />
            </label>

            <label className="campo campo-largo">
              <span>E-mail do contato <b>*</b></span>
              <input
                name="email_contato"
                type="email"
                value={dados.email_contato}
                onChange={(evento) => atualizarCampo("email_contato", evento.target.value)}
                placeholder="nome@empresa.com.br"
                required
              />
            </label>

            <div className="campo campo-largo grupo-emails-participantes">
              {emailsSecundarios.map((email, indice) => (
                <div className="linha-email-participante" key={indice}>
                  <label>
                    <span>E-mail adicional {indice + 1}</span>
                    <input
                      name={`email_secundario_${indice + 1}`}
                      type="email"
                      value={email}
                      onChange={(evento) =>
                        atualizarEmailSecundario(indice, evento.target.value)
                      }
                      placeholder="participante@empresa.com.br"
                      required
                    />
                  </label>
                  <button
                    type="button"
                    className="botao-remover-email"
                    onClick={() => removerEmailSecundario(indice)}
                    aria-label={`Remover e-mail adicional ${indice + 1}`}
                  >
                    Remover
                  </button>
                </div>
              ))}

              <div className="acao-adicionar-email">
                <button
                  type="button"
                  className="botao-adicionar-email"
                  onClick={adicionarEmailSecundario}
                  disabled={emailsSecundarios.length >= 10}
                >
                  <span aria-hidden="true">+</span>
                  Adicionar outro e-mail
                </button>

                <label className="campo quantidade-clientes-inline">
                  <span>Quantidade de clientes</span>
                  <input
                    name="quantidade_clientes"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={dados.quantidade_clientes}
                    onChange={(evento) =>
                      atualizarCampo("quantidade_clientes", evento.target.value)
                    }
                    placeholder="Ex.: 150"
                  />
                </label>
                <small>
                  Os e-mails adicionais serão convidados somente pelo Google Agenda.
                </small>
              </div>
            </div>

            <label className="campo">
              <span>Data da reunião <b>*</b></span>
              <input
                name="data_reuniao"
                type="date"
                min={dataMinima}
                value={dados.data_reuniao}
                onChange={(evento) => atualizarCampo("data_reuniao", evento.target.value)}
                required
              />
            </label>

            <label className="campo">
              <span>Horário da reunião <b>*</b></span>
              <select
                name="horario_reuniao"
                value={dados.horario_reuniao}
                onChange={(evento) => atualizarCampo("horario_reuniao", evento.target.value)}
                disabled={
                  !dados.data_reuniao ||
                  carregandoHorarios ||
                  horariosDisponiveis.length === 0
                }
                required
              >
                <option value="">
                  {!dados.data_reuniao
                    ? "Selecione primeiro a data"
                    : carregandoHorarios
                      ? "Consultando agendas..."
                      : horariosDisponiveis.length === 0
                        ? "Nenhum horário disponível"
                        : "Selecione o horário"}
                </option>
                {horariosDisponiveis.map((horario) => (
                  <option key={horario} value={horario}>
                    {horario}
                  </option>
                ))}
              </select>
              <small>
                {mensagemHorarios ||
                  "Horários de 30 em 30 minutos, com pelo menos um Closer disponível e antecedência mínima de 15 minutos."}
              </small>
            </label>

            <label className="campo campo-largo">
              <span>Observação</span>
              <textarea
                name="observacao"
                value={dados.observacao}
                onChange={(evento) => atualizarCampo("observacao", evento.target.value)}
                placeholder="Inclua informações importantes para a reunião"
                rows={4}
                maxLength={5000}
              />
            </label>

            {mensagemErro && (
              <div className="mensagem-erro campo-largo" role="alert">
                <span aria-hidden="true">!</span>
                <div>
                  <strong>Não foi possível agendar a reunião.</strong>
                  <p>{mensagemErro}</p>
                  {motivosErro.length > 0 && (
                    <ul>
                      {motivosErro.map((motivo) => (
                        <li key={motivo}>{motivo}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <div className="rodape-formulario rodape-formulario-direita campo-largo">
              <button type="submit" disabled={enviando} aria-busy={enviando}>
                {enviando
                  ? "Confirmando disponibilidade..."
                  : "Enviar e agendar reunião"}
                {!enviando && <span aria-hidden="true">→</span>}
              </button>
            </div>
          </form>
        </section>

        <footer className="rodape-pagina">
          <span>© 2026 Programa de Indicações</span>
          <span>Seus dados são tratados com segurança e responsabilidade.</span>
        </footer>
      </div>
    </main>
  );
}
