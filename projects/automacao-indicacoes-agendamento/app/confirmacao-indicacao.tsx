"use client";

import type { TipoDocumentoCliente } from "../lib/validacao-documento-cliente";

export type EmpresaResumoIndicacao = {
  nome_cliente: string;
  tipo_documento_cliente: TipoDocumentoCliente;
  cnpj_cliente: string;
  quantidade_funcionarios: string;
  cargos: string;
  indicacao_id?: number;
  negociacao_id?: string;
  status?: "sucesso" | "erro";
  mensagem?: string;
};

export type ResumoIndicacao = {
  id_parceiro: string;
  nome_parceiro: string;
  operacao: string;
  consultora: string;
  nome_contato: string;
  telefone_contato: string;
  email_contato: string;
  observacao: string;
  empresas: EmpresaResumoIndicacao[];
  contato_id?: string;
  responsavel_id?: string;
  data_hora_envio: string;
};

function valorOuNaoInformado(valor?: string | number) {
  return valor ? String(valor) : "Não informado";
}

export function ConfirmacaoIndicacao({ resumo }: { resumo: ResumoIndicacao }) {
  const itensContato = [
    ["ID do parceiro", resumo.id_parceiro],
    ["Nome do parceiro", resumo.nome_parceiro],
    ["Operação", resumo.operacao],
    ["Consultor(a)", resumo.consultora],
    ["Nome do contato", resumo.nome_contato],
    ["Telefone", resumo.telefone_contato],
    ["E-mail", valorOuNaoInformado(resumo.email_contato)],
    ["Observação geral", valorOuNaoInformado(resumo.observacao)],
    ["Contato no RD", valorOuNaoInformado(resumo.contato_id)],
    ["Responsável no RD", valorOuNaoInformado(resumo.responsavel_id)],
    [
      "Data e hora do envio",
      new Date(resumo.data_hora_envio).toLocaleString("pt-BR"),
    ],
  ];

  const quantidadeSucessos = resumo.empresas.filter(
    (empresa) => empresa.status !== "erro",
  ).length;

  return (
    <main className="pagina-agradecimento">
      <section className="cartao-agradecimento">
        <header className="cabecalho-agradecimento">
          <span className="marca-texto">Programa de Indicações</span>
          <span className="selo-seguro">Indicação registrada</span>
        </header>

        <div className="icone-sucesso-grande" aria-hidden="true">✓</div>
        <span className="etiqueta">Envio concluído</span>
        <h1>Obrigado pela indicação!</h1>
        <p className="texto-agradecimento">
          {quantidadeSucessos} negociação(ões) foram registradas com o mesmo
          contato e responsável.
        </p>

        <div className="titulo-resumo">
          <h2>Contato principal</h2>
          <p>Este contato foi compartilhado entre as empresas indicadas.</p>
        </div>

        <dl className="resumo-indicacao">
          {itensContato.map(([rotulo, valor]) => (
            <div className="item-resumo" key={rotulo}>
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>

        <div className="titulo-resumo">
          <h2>Empresas indicadas</h2>
          <p>Uma negociação foi processada para cada empresa.</p>
        </div>

        <div className="lista-resumo-empresas">
          {resumo.empresas.map((empresa, indice) => (
            <section className="resumo-empresa" key={`${empresa.cnpj_cliente}-${indice}`}>
              <header>
                <strong>Empresa {indice + 1}</strong>
                <span className={empresa.status === "erro" ? "status-erro" : "status-sucesso"}>
                  {empresa.status === "erro" ? "Com erro" : "Criada"}
                </span>
              </header>
              <dl className="resumo-indicacao">
                <div className="item-resumo">
                  <dt>Nome da empresa</dt>
                  <dd>{empresa.nome_cliente}</dd>
                </div>
                <div className="item-resumo">
                  <dt>{empresa.tipo_documento_cliente}</dt>
                  <dd>{empresa.cnpj_cliente}</dd>
                </div>
                <div className="item-resumo">
                  <dt>Quantidade de colaboradores</dt>
                  <dd>{valorOuNaoInformado(empresa.quantidade_funcionarios)}</dd>
                </div>
                <div className="item-resumo">
                  <dt>Cargos</dt>
                  <dd>{valorOuNaoInformado(empresa.cargos)}</dd>
                </div>
                <div className="item-resumo">
                  <dt>Protocolo</dt>
                  <dd>{valorOuNaoInformado(empresa.indicacao_id)}</dd>
                </div>
                <div className="item-resumo">
                  <dt>Negociação no RD</dt>
                  <dd>{valorOuNaoInformado(empresa.negociacao_id)}</dd>
                </div>
                {empresa.mensagem && (
                  <div className="item-resumo">
                    <dt>Resultado</dt>
                    <dd>{empresa.mensagem}</dd>
                  </div>
                )}
              </dl>
            </section>
          ))}
        </div>

        <div className="acoes-agradecimento">
          <p>Você já pode fechar esta página com segurança.</p>
        </div>
      </section>
    </main>
  );
}
