"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  ConfirmacaoIndicacao,
  type EmpresaResumoIndicacao,
  type ResumoIndicacao,
} from "./confirmacao-indicacao";
import {
  documentoClienteValido,
  formatarDocumentoCliente,
  type TipoDocumentoCliente,
} from "../lib/validacao-documento-cliente";

type PropriedadesFormulario = {
  operacao: string;
  idParceiro: string;
  nomeParceiro: string;
  consultora: string;
};

type EmpresaFormulario = {
  id: string;
  nome_cliente: string;
  tipo_documento_cliente: TipoDocumentoCliente;
  cnpj_cliente: string;
  quantidade_funcionarios: string;
  cargos: string;
};

type DadosFormulario = {
  nome_contato: string;
  telefone_contato: string;
  email_contato: string;
  observacao: string;
  empresas: EmpresaFormulario[];
};

type ResultadoEmpresaApi = {
  indice_empresa: number;
  indicacao_id: number;
  nome_cliente: string;
  negociacao_id?: string;
  status: "sucesso" | "erro";
  mensagem: string;
};

const LIMITE_EMPRESAS = 10;

function novaEmpresa(id: string): EmpresaFormulario {
  return {
    id,
    nome_cliente: "",
    tipo_documento_cliente: "CNPJ",
    cnpj_cliente: "",
    quantidade_funcionarios: "",
    cargos: "",
  };
}

const dadosIniciais: DadosFormulario = {
  nome_contato: "",
  telefone_contato: "",
  email_contato: "",
  observacao: "",
  empresas: [novaEmpresa("empresa-inicial")],
};

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

function somenteInteiros(valor: string) {
  return valor.replace(/\D/g, "");
}

function gerarIdEmpresa() {
  return `empresa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function FormularioIndicacao({
  operacao,
  idParceiro,
  nomeParceiro,
  consultora,
}: PropriedadesFormulario) {
  const idParceiroExibicao = idParceiro.replace(/_[DQ]$/i, "");
  const [dados, setDados] = useState(dadosIniciais);
  const [confirmacao, setConfirmacao] = useState<ResumoIndicacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensagemErro, setMensagemErro] = useState("");

  const contexto = useMemo(
    () => ({
      id_parceiro: idParceiro,
      nome_parceiro: nomeParceiro,
      operacao,
      consultora,
    }),
    [idParceiro, nomeParceiro, operacao, consultora],
  );

  function atualizarContato(
    nome:
      | "nome_contato"
      | "telefone_contato"
      | "email_contato"
      | "observacao",
    valor: string,
  ) {
    setMensagemErro("");
    setDados((atual) => ({ ...atual, [nome]: valor }));
  }

  function atualizarEmpresa(
    id: string,
    nome: Exclude<keyof EmpresaFormulario, "id">,
    valor: string,
  ) {
    setMensagemErro("");
    setDados((atual) => ({
      ...atual,
      empresas: atual.empresas.map((empresa) =>
        empresa.id === id ? { ...empresa, [nome]: valor } : empresa,
      ),
    }));
  }

  function adicionarEmpresa() {
    if (dados.empresas.length >= LIMITE_EMPRESAS) return;
    setMensagemErro("");
    setDados((atual) => ({
      ...atual,
      empresas: [...atual.empresas, novaEmpresa(gerarIdEmpresa())],
    }));
  }

  function removerEmpresa(id: string) {
    if (dados.empresas.length === 1) return;
    setMensagemErro("");
    setDados((atual) => ({
      ...atual,
      empresas: atual.empresas.filter((empresa) => empresa.id !== id),
    }));
  }

  async function enviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const campoTelefone = formulario.elements.namedItem(
      "telefone_contato",
    ) as HTMLInputElement;
    const numerosTelefone = dados.telefone_contato.replace(/\D/g, "");

    if (![10, 11].includes(numerosTelefone.length)) {
      campoTelefone.setCustomValidity(
        "Informe um telefone fixo ou celular com DDD.",
      );
      campoTelefone.reportValidity();
      return;
    }
    campoTelefone.setCustomValidity("");

    const documentos = new Set<string>();
    for (const [indice, empresa] of dados.empresas.entries()) {
      const campoDocumento = formulario.elements.namedItem(
        `cnpj_cliente_${indice}`,
      ) as HTMLInputElement;
      if (
        !documentoClienteValido(
          empresa.cnpj_cliente,
          empresa.tipo_documento_cliente,
        )
      ) {
        campoDocumento.setCustomValidity(
          empresa.tipo_documento_cliente === "CNPJ"
            ? "Informe um CNPJ válido."
            : empresa.tipo_documento_cliente === "CPF"
              ? "Informe um CPF válido."
              : "Informe um CAEPF com 14 dígitos.",
        );
        campoDocumento.reportValidity();
        return;
      }

      const documento = empresa.cnpj_cliente.replace(/\D/g, "");
      if (documentos.has(documento)) {
        campoDocumento.setCustomValidity(
          "Este documento já foi informado em outra empresa deste grupo.",
        );
        campoDocumento.reportValidity();
        return;
      }
      documentos.add(documento);
      campoDocumento.setCustomValidity("");
    }

    setEnviando(true);
    setMensagemErro("");

    try {
      const resposta = await fetch("/api/indicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...contexto, ...dados }),
      });
      const resultado = (await resposta.json()) as {
        mensagem?: string;
        indicacao_ids?: number[];
        negociacao_ids?: string[];
        contato_id?: string;
        responsavel_id?: string;
        resultados?: ResultadoEmpresaApi[];
      };

      if (!resposta.ok) {
        setMensagemErro(
          resultado.mensagem ??
            "Não foi possível enviar a indicação. Tente novamente.",
        );
        return;
      }

      const resultadosPorIndice = new Map(
        (resultado.resultados ?? []).map((item) => [item.indice_empresa, item]),
      );
      const empresasResumo: EmpresaResumoIndicacao[] = dados.empresas.map(
        (empresa, indice) => {
          const retorno = resultadosPorIndice.get(indice);
          return {
            nome_cliente: empresa.nome_cliente,
            tipo_documento_cliente: empresa.tipo_documento_cliente,
            cnpj_cliente: empresa.cnpj_cliente,
            quantidade_funcionarios: empresa.quantidade_funcionarios,
            cargos: empresa.cargos,
            indicacao_id: retorno?.indicacao_id,
            negociacao_id: retorno?.negociacao_id,
            status: retorno?.status ?? "sucesso",
            mensagem: retorno?.mensagem,
          };
        },
      );

      const resumo: ResumoIndicacao = {
        id_parceiro: idParceiroExibicao,
        nome_parceiro: nomeParceiro,
        operacao,
        consultora,
        nome_contato: dados.nome_contato,
        telefone_contato: dados.telefone_contato,
        email_contato: dados.email_contato,
        observacao: dados.observacao,
        empresas: empresasResumo,
        contato_id: resultado.contato_id,
        responsavel_id: resultado.responsavel_id,
        data_hora_envio: new Date().toISOString(),
      };
      sessionStorage.removeItem("agendamento_sst_confirmado");
      sessionStorage.setItem("indicacao_sst_confirmada", JSON.stringify(resumo));
      setConfirmacao(resumo);
      window.history.replaceState(window.history.state, "", "/obrigado");
    } catch {
      setMensagemErro(
        "Não foi possível conectar ao serviço de indicações. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (confirmacao) {
    return <ConfirmacaoIndicacao resumo={confirmacao} />;
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
              <span>Programa de Indicações</span>
            </div>
          </div>
          <span className="selo-seguro">Ambiente seguro</span>
        </header>

        <section className="introducao">
          <span className="etiqueta">Indique uma ou mais empresas</span>
          <p>
            Informe o contato principal e cadastre as empresas do grupo que
            deseja indicar.
          </p>
        </section>

        <section className="cartao-formulario" aria-labelledby="titulo-formulario">
          <div className="topo-cartao">
            <div>
              <span className="numero-etapa">01</span>
              <div>
                <h2 id="titulo-formulario">Dados da indicação</h2>
                <p>Os campos com asterisco são obrigatórios.</p>
              </div>
            </div>
            <span className="status-contexto">Link identificado</span>
          </div>

          <div className="contexto-indicacao" aria-label="Informações do link">
            <label>
              <span>ID do parceiro</span>
              <input value={idParceiroExibicao} readOnly aria-readonly="true" />
            </label>
            <label>
              <span>Nome do parceiro</span>
              <input value={nomeParceiro} readOnly aria-readonly="true" />
            </label>
            <label>
              <span>Operação</span>
              <input value={operacao} readOnly aria-readonly="true" />
            </label>
            <label>
              <span>Consultor(a)</span>
              <input value={consultora} readOnly aria-readonly="true" />
            </label>
          </div>

          <form onSubmit={enviarFormulario} className="formulario-indicacao-grupo">
            <div className="divisor">
              <span>Contato principal</span>
            </div>

            <div className="campos-editaveis bloco-contato-principal">
              <label className="campo campo-largo">
                <span>Nome do contato <b>*</b></span>
                <input
                  name="nome_contato"
                  value={dados.nome_contato}
                  onChange={(evento) =>
                    atualizarContato("nome_contato", evento.target.value)
                  }
                  placeholder="Nome completo da PESSOA que será efetuado o contato"
                  autoComplete="name"
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
                    atualizarContato(
                      "telefone_contato",
                      aplicarMascaraTelefone(evento.target.value),
                    );
                  }}
                  placeholder="(31) 3333-4444 ou (31) 99999-9999"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={15}
                  required
                />
              </label>

              <label className="campo">
                <span>E-mail do contato</span>
                <input
                  name="email_contato"
                  type="email"
                  value={dados.email_contato}
                  onChange={(evento) =>
                    atualizarContato("email_contato", evento.target.value)
                  }
                  placeholder="nome@empresa.com.br"
                  autoComplete="email"
                />
              </label>
            </div>

            <div className="divisor divisor-empresas">
              <span>Empresas indicadas</span>
            </div>

            <div className="lista-empresas-formulario">
              {dados.empresas.map((empresa, indice) => (
                <section className="cartao-empresa-formulario" key={empresa.id}>
                  <header className="cabecalho-empresa-formulario">
                    <div>
                      <span className="numero-empresa">{indice + 1}</span>
                      <div>
                        <strong>Empresa {indice + 1}</strong>
                        <small>Será criada uma negociação para esta empresa.</small>
                      </div>
                    </div>
                    {dados.empresas.length > 1 && (
                      <button
                        type="button"
                        className="botao-remover-empresa"
                        onClick={() => removerEmpresa(empresa.id)}
                        aria-label={`Remover empresa ${indice + 1}`}
                      >
                        Remover
                      </button>
                    )}
                  </header>

                  <div className="campos-editaveis">
                    <label className="campo campo-largo">
                      <span>Nome da empresa <b>*</b></span>
                      <input
                        name={`nome_cliente_${indice}`}
                        value={empresa.nome_cliente}
                        onChange={(evento) =>
                          atualizarEmpresa(
                            empresa.id,
                            "nome_cliente",
                            evento.target.value,
                          )
                        }
                        placeholder="Digite o nome da empresa"
                        autoComplete="organization"
                        minLength={2}
                        required
                      />
                    </label>

                    <label className="campo">
                      <span>Tipo de documento <b>*</b></span>
                      <select
                        name={`tipo_documento_cliente_${indice}`}
                        value={empresa.tipo_documento_cliente}
                        onChange={(evento) => {
                          atualizarEmpresa(
                            empresa.id,
                            "tipo_documento_cliente",
                            evento.target.value as TipoDocumentoCliente,
                          );
                          atualizarEmpresa(empresa.id, "cnpj_cliente", "");
                        }}
                        required
                      >
                        <option value="CNPJ">CNPJ</option>
                        <option value="CAEPF">CAEPF</option>
                        <option value="CPF">CPF</option>
                      </select>
                    </label>

                    <label className="campo">
                      <span>{empresa.tipo_documento_cliente} da empresa <b>*</b></span>
                      <input
                        name={`cnpj_cliente_${indice}`}
                        value={empresa.cnpj_cliente}
                        onChange={(evento) => {
                          evento.target.setCustomValidity("");
                          atualizarEmpresa(
                            empresa.id,
                            "cnpj_cliente",
                            formatarDocumentoCliente(
                              evento.target.value,
                              empresa.tipo_documento_cliente,
                            ),
                          );
                        }}
                        placeholder={
                          empresa.tipo_documento_cliente === "CNPJ"
                            ? "00.000.000/0000-00"
                            : empresa.tipo_documento_cliente === "CPF"
                              ? "000.000.000-00"
                              : "000.000.000/000-00"
                        }
                        inputMode="numeric"
                        maxLength={
                          empresa.tipo_documento_cliente === "CPF" ? 14 : 18
                        }
                        required
                      />
                    </label>

                    <label className="campo">
                      <span>Quantidade de colaboradores</span>
                      <input
                        name={`quantidade_funcionarios_${indice}`}
                        value={empresa.quantidade_funcionarios}
                        onChange={(evento) =>
                          atualizarEmpresa(
                            empresa.id,
                            "quantidade_funcionarios",
                            somenteInteiros(evento.target.value),
                          )
                        }
                        placeholder="Ex.: 50"
                        inputMode="numeric"
                        maxLength={9}
                      />
                    </label>

                    <label className="campo">
                      <span>Cargos</span>
                      <input
                        name={`cargos_${indice}`}
                        value={empresa.cargos}
                        onChange={(evento) =>
                          atualizarEmpresa(
                            empresa.id,
                            "cargos",
                            somenteInteiros(evento.target.value),
                          )
                        }
                        placeholder="Ex.: 8"
                        inputMode="numeric"
                        maxLength={9}
                      />
                    </label>

                  </div>
                </section>
              ))}
            </div>

            <div className="acao-adicionar-empresa">
              <button
                type="button"
                className="botao-adicionar-empresa"
                onClick={adicionarEmpresa}
                disabled={dados.empresas.length >= LIMITE_EMPRESAS}
              >
                <span aria-hidden="true">+</span>
                Adicionar empresa do mesmo grupo
              </button>
              <small>
                {dados.empresas.length} de {LIMITE_EMPRESAS} empresas adicionadas
              </small>
            </div>

            <div className="divisor divisor-observacao-geral">
              <span>Observação geral</span>
            </div>

            <label className="campo campo-observacao-geral">
              <span>Observação</span>
              <textarea
                name="observacao"
                value={dados.observacao}
                onChange={(evento) =>
                  atualizarContato("observacao", evento.target.value)
                }
                placeholder="Digite informações gerais para todas as empresas do grupo"
                rows={4}
                maxLength={5000}
              />
              <small>
                Esta observação será registrada em todas as negociações criadas.
              </small>
            </label>

            {mensagemErro && (
              <div className="mensagem-erro" role="alert">
                <span aria-hidden="true">!</span>
                <div>
                  <strong>Não foi possível enviar a indicação.</strong>
                  <p>{mensagemErro}</p>
                </div>
              </div>
            )}

            <div className="rodape-formulario">
              <p>
                Será criado apenas um contato e uma negociação para cada
                empresa. Todas ficarão com o mesmo responsável.
              </p>
              <button type="submit" disabled={enviando} aria-busy={enviando}>
                {enviando ? "Criando negociações..." : "Enviar indicação"}
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
