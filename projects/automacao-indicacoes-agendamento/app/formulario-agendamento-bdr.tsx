"use client";

import { useEffect, useState } from "react";
import { CalendarioDataReuniao } from "./calendario-data-reuniao";

type Contato = { id: string; nome: string; cargo: string; telefones: string[]; emails: string[] };
type Negociacao = { id: string; nome: string; status: string; empresa: { id: string; nome: string } | null; pre_vendedor: { id: string; nome: string } | null; contatos: Contato[]; emails: string[] };
type Resultado = { mensagem: string; responsavel: string; data_reuniao: string; evento_google_meet_link: string };

function hoje() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export function FormularioAgendamentoBdr({ idNegociacao }: { idNegociacao: string }) {
  const [negociacao, setNegociacao] = useState<Negociacao | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [data, setData] = useState("");
  const [horario, setHorario] = useState("");
  const [horarios, setHorarios] = useState<string[]>([]);
  const [observacao, setObservacao] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [consultando, setConsultando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [dataMinima] = useState(hoje);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/agendamento-bdr-sst/negociacoes/${encodeURIComponent(idNegociacao)}`, { cache: "no-store" })
      .then(async (resposta) => {
        const corpo = await resposta.json();
        if (!resposta.ok) throw new Error(corpo.mensagem || "Não foi possível carregar a negociação.");
        return corpo as Negociacao;
      })
      .then((dados) => { if (ativo) { setNegociacao(dados); setSelecionados(dados.emails); } })
      .catch((falha) => { if (ativo) setErro(falha.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [idNegociacao]);

  useEffect(() => {
    if (!data) return;
    let ativo = true;
    fetch(`/api/agendamento-bdr-sst/disponibilidade?data=${encodeURIComponent(data)}`, { cache: "no-store" })
      .then(async (resposta) => { const corpo = await resposta.json(); if (!resposta.ok) throw new Error(corpo.mensagem); return corpo; })
      .then((corpo) => { if (ativo) setHorarios(corpo.horarios ?? []); })
      .catch((falha) => { if (ativo) setErro(falha.message || "Não foi possível consultar os horários."); })
      .finally(() => { if (ativo) setConsultando(false); });
    return () => { ativo = false; };
  }, [data]);

  function selecionarData(novaData: string) {
    setData(novaData);
    setHorarios([]);
    setHorario("");
    setErro("");
    setConsultando(true);
  }

  function alternarEmail(email: string) {
    setSelecionados((atuais) => atuais.includes(email) ? atuais.filter((item) => item !== email) : [...atuais, email]);
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault(); setErro("");
    if (selecionados.length === 0) { setErro("Selecione pelo menos um e-mail para receber o convite."); return; }
    if (!data || !horario) { setErro("Selecione a data e o horário da reunião."); return; }
    setEnviando(true);
    try {
      const resposta = await fetch("/api/agendamento-bdr-sst/agendamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ negociacao_id: idNegociacao, emails_participantes: selecionados, data_reuniao: data, horario_reuniao: horario, observacao }) });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.mensagem || "Não foi possível concluir o agendamento.");
      setResultado(corpo);
    } catch (falha) { setErro(falha instanceof Error ? falha.message : "Não foi possível concluir o agendamento."); }
    finally { setEnviando(false); }
  }

  if (carregando) return <main className="pagina-bdr-sst estado-pagina-bdr"><section className="cartao-bdr estado-bdr"><div className="spinner-bdr" /><h1>Carregando negociação</h1><p>Buscando os dados diretamente no RD Station…</p></section></main>;
  if (!negociacao) return <main className="pagina-bdr-sst estado-pagina-bdr"><section className="cartao-bdr estado-bdr erro-bdr"><span className="icone-estado-bdr">!</span><h1>Não foi possível abrir o formulário</h1><p>{erro}</p></section></main>;
  if (resultado) return <main className="pagina-bdr-sst estado-pagina-bdr"><section className="cartao-bdr confirmacao-bdr"><span className="icone-sucesso-bdr">✓</span><p className="sobretitulo-bdr">Agendamento confirmado</p><h1>Reunião marcada com sucesso</h1><p>O convite foi enviado e a atividade foi registrada na negociação do RD.</p><dl><div><dt>Responsável</dt><dd>{resultado.responsavel}</dd></div><div><dt>Data e horário</dt><dd>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(resultado.data_reuniao))}</dd></div></dl></section></main>;

  return <main className="pagina-bdr-sst formulario-bdr-sst">
    <div className="fundo-decorativo fundo-um" aria-hidden="true" />
    <div className="fundo-decorativo fundo-dois" aria-hidden="true" />
    <div className="conteudo-formulario">
    <header className="cabecalho"><div className="marca"><span>Q</span><div><strong>Quality SST</strong><small>Agendamento BDR</small></div></div><div className="seguro">Dados protegidos • RD Station</div></header>
    <section className="introducao"><p className="sobretitulo etiqueta">Agendamento de reunião SST</p><h1>Escolha o melhor horário</h1><p>Revise os contatos que receberão o convite e selecione um horário disponível na agenda do closer.</p></section>
    <form className="cartao-bdr formulario-bdr cartao-formulario-bdr" onSubmit={enviar}>
      <section className="secao"><div className="titulo-secao"><span>1</span><div><h2>Negociação</h2><p>Informações carregadas diretamente do RD Station.</p></div></div>
        <div className="grade-dados"><label><span>Negociação</span><input readOnly value={negociacao.nome} /></label><label><span>Empresa</span><input readOnly value={negociacao.empresa?.nome || "Não informada"} /></label><label><span>Pré-vendedor</span><input readOnly value={negociacao.pre_vendedor?.nome || "Não informado"} /></label></div>
        <p className="rotulo-contatos">Contato(s):</p>
        <div className="contatos">{negociacao.contatos.map((contato) => <article key={contato.id}><div className="avatar">{contato.nome.slice(0, 1).toUpperCase()}</div><div><strong>{contato.nome}</strong>{contato.cargo && <small>{contato.cargo}</small>}<p>{contato.telefones.join(" • ") || "Telefone não informado"}</p></div></article>)}</div>
      </section>
      <section className="secao"><div className="titulo-secao"><span>2</span><div><h2>Participantes</h2><p>Selecione ao menos um e-mail vinculado aos contatos da negociação.</p></div></div>
        <div className="lista-emails">{negociacao.emails.map((email) => <label key={email} className={selecionados.includes(email) ? "email selecionado" : "email"}><input type="checkbox" checked={selecionados.includes(email)} onChange={() => alternarEmail(email)} /><span className="check">✓</span><span>{email}</span></label>)}</div>
        <p className="ajuda">Não é possível adicionar endereços externos; a lista é sincronizada com o RD.</p>
      </section>
      <section className="secao"><div className="titulo-secao"><span>3</span><div><h2>Data e horário</h2><p>Reuniões de 30 minutos, de segunda a sexta-feira.</p></div></div>
        <div className="agenda"><div><label id="rotulo-data-reuniao">Data da reunião</label><CalendarioDataReuniao value={data} min={dataMinima} onChange={selecionarData} /></div><div><label>Horário</label><select value={horario} onChange={(evento) => setHorario(evento.target.value)} disabled={!data || consultando}><option value="">{consultando ? "Consultando agenda…" : horarios.length ? "Selecione" : data ? "Sem horários disponíveis" : "Escolha uma data primeiro"}</option>{horarios.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div>
        <label className="observacao"><span>Observações <small>(opcional)</small></span><textarea maxLength={5000} value={observacao} onChange={(evento) => setObservacao(evento.target.value)} placeholder="Inclua alguma informação útil para a reunião." /></label>
      </section>
      {erro && <div className="alerta" role="alert">{erro}</div>}
      <button className="botao-principal" type="submit" disabled={enviando}>{enviando ? "Confirmando agendamento…" : "Confirmar agendamento"}</button>
      <p className="rodape-formulario">Ao confirmar, o closer será definido no RD e o convite será enviado pelo Google Agenda.</p>
    </form>
    <footer className="rodape-pagina"><span>Quality SST</span><span>Agendamento seguro e integrado ao RD Station</span></footer>
    </div>
  </main>;
}
