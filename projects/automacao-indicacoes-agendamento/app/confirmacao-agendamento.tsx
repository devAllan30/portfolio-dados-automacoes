"use client";

export type ResumoAgendamento = {
  id_parceiro: string;
  nome_parceiro: string;
  operacao: string;
  consultora: string;
  curva?: string;
  setor?: string;
  documento_parceiro?: string;
  nome_empresa: string;
  nome_negociacao: string;
  nome_contato: string;
  telefone_contato: string;
  email_contato: string;
  emails_secundarios: string[];
  quantidade_clientes: string;
  responsavel: string;
  data_reuniao: string;
  horario_reuniao: string;
  observacao: string;
  empresa_criada?: boolean;
  negociacao_criada?: boolean;
  empresa_id?: string;
  negociacao_id?: string;
  tarefa_id?: string;
  evento_google_id?: string;
  evento_google_link?: string;
  evento_google_meet_link?: string;
  data_hora_envio: string;
};

function valorOuNaoInformado(valor?: string) {
  return valor ? valor : "Não informado";
}

function formatarData(data: string) {
  const [ano, mes, dia] = data.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

export function ConfirmacaoAgendamento({
  resumo,
}: {
  resumo: ResumoAgendamento;
}) {
  const itens = [
    ["ID do parceiro", resumo.id_parceiro],
    ["Nome do parceiro", resumo.nome_parceiro],
    ["Operação", resumo.operacao],
    ["Consultor(a)", resumo.consultora],
    ["Curva", valorOuNaoInformado(resumo.curva)],
    ["Setor", valorOuNaoInformado(resumo.setor)],
    ["CPF/CNPJ do parceiro", valorOuNaoInformado(resumo.documento_parceiro)],
    ["Nome da empresa", resumo.nome_empresa],
    ["Nome da negociação", resumo.nome_negociacao],
    ["Nome do contato", resumo.nome_contato],
    ["Telefone", resumo.telefone_contato],
    ["E-mail", valorOuNaoInformado(resumo.email_contato)],
    [
      "Participantes adicionais",
      resumo.emails_secundarios.length > 0
        ? resumo.emails_secundarios.join(", ")
        : "Não informado",
    ],
    ["Quantidade de clientes", valorOuNaoInformado(resumo.quantidade_clientes)],
    ["Responsável pela reunião", resumo.responsavel],
    ["Data da reunião", formatarData(resumo.data_reuniao)],
    ["Horário da reunião", resumo.horario_reuniao],
    ["Assunto", "Reunião Sst"],
    ["Observação", valorOuNaoInformado(resumo.observacao)],
    [
      "Situação da empresa",
      resumo.empresa_criada ? "Criada neste envio" : "Empresa já existente",
    ],
    [
      "Situação da negociação",
      resumo.negociacao_criada
        ? "Criada neste envio"
        : "Negociação já existente no funil",
    ],
    ["Empresa no RD", valorOuNaoInformado(resumo.empresa_id)],
    ["Negociação no RD", valorOuNaoInformado(resumo.negociacao_id)],
    ["Tarefa no RD", valorOuNaoInformado(resumo.tarefa_id)],
    [
      "Evento no Google Agenda",
      resumo.evento_google_id ? "Criado com sucesso" : "Não informado",
    ],
    [
      "Data e hora do envio",
      new Date(resumo.data_hora_envio).toLocaleString("pt-BR"),
    ],
  ];

  return (
    <main className="pagina-agradecimento">
      <section className="cartao-agradecimento">
        <header className="cabecalho-agradecimento">
          <span className="marca-texto">Programa de Indicações</span>
          <span className="selo-seguro">Reunião agendada</span>
        </header>

        <div className="icone-sucesso-grande" aria-hidden="true">✓</div>
        <span className="etiqueta">Agendamento concluído</span>
        <h1>Obrigado pela indicação!</h1>
        <p className="texto-agradecimento">
          Recebemos as informações e a reunião foi agendada no RD Station e no
          Google Agenda do responsável.
        </p>

        <div className="titulo-resumo">
          <h2>Resumo do agendamento</h2>
          <p>Confira abaixo todas as informações enviadas.</p>
        </div>

        <dl className="resumo-indicacao">
          {itens.map(([rotulo, valor]) => (
            <div className="item-resumo" key={rotulo}>
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>

        {resumo.evento_google_link && (
          <div className="acoes-agradecimento">
            <a
              href={resumo.evento_google_link}
              target="_blank"
              rel="noreferrer"
            >
              Abrir evento no Google Agenda
            </a>
          </div>
        )}

        {resumo.evento_google_meet_link && (
          <div className="acoes-agradecimento">
            <a
              href={resumo.evento_google_meet_link}
              target="_blank"
              rel="noreferrer"
            >
              Entrar na reunião pelo Google Meet
            </a>
          </div>
        )}

        <div className="acoes-agradecimento">
          <p>Você já pode fechar esta página com segurança.</p>
        </div>
      </section>
    </main>
  );
}
