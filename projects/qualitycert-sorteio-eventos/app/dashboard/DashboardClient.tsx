'use client';

import Image from 'next/image';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type EventOption = { id:number; nomeEvento:string; prefixo:string; ativo:boolean; dataInicio:string|null; dataFinal:string|null; tipoInteracao:string };
type Metrics = {
  evento: Omit<EventOption, 'tipoInteracao'>;
  sorteio: { total:number; utilizados:number; disponiveis:number };
  roleta: { quantidadeCertificados:number; total:number; utilizados:number; disponiveis:number }[];
};
type DetailFilter = { interacao:'sorteio'|'roleta'; quantidadeCertificados?:number };
type Participant = { id:number; codigo:string; quantidadeCertificados:number|null; nome:string; telefone:string; email:string; cpf:string; contabilidade:string; cnpj:string|null; preenchidoEm:string|null };

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${value.slice(0,10)}T00:00:00Z`)) : 'Não definida';
}
function maskCpf(value:string) { return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'); }

export default function DashboardClient({ isAdmin }: Readonly<{ isAdmin:boolean }>) {
  const [events,setEvents] = useState<EventOption[]>([]);
  const [eventId,setEventId] = useState('');
  const [metrics,setMetrics] = useState<Metrics|null>(null);
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState('');
  const [detail,setDetail] = useState<DetailFilter|null>(null);
  const [participants,setParticipants] = useState<Participant[]>([]);
  const [participantTotal,setParticipantTotal] = useState(0);
  const [participantSearch,setParticipantSearch] = useState('');
  const [detailLoading,setDetailLoading] = useState(false);
  const [detailMessage,setDetailMessage] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(async (response) => {
        const data = await response.json() as { eventos?:EventOption[]; message?:string };
        if (!response.ok) throw new Error(data.message);
        setEvents(data.eventos ?? []);
      })
      .catch(() => setMessage('Não foi possível carregar os eventos.'))
      .finally(() => setLoading(false));
  },[]);

  async function changeEvent(value:string) {
    const sequence = ++requestSequence.current;
    setEventId(value); setMetrics(null); setMessage(''); setDetail(null); setParticipants([]); setParticipantSearch('');
    if (!value) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?eventoId=${value}`);
      const data = await response.json() as Metrics & { message?:string };
      if (!response.ok) throw new Error(data.message);
      if (sequence === requestSequence.current) setMetrics(data);
    } catch {
      if (sequence === requestSequence.current) setMessage('Não foi possível carregar os indicadores.');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  async function loadParticipants(filter:DetailFilter,nome='') {
    if (!eventId) return;
    setDetailLoading(true); setDetailMessage('');
    const query = new URLSearchParams({ eventoId:eventId, interacao:filter.interacao });
    if (filter.quantidadeCertificados !== undefined) query.set('certificados',String(filter.quantidadeCertificados));
    if (nome.trim()) query.set('nome',nome.trim());
    try {
      const response = await fetch(`/api/dashboard/participantes?${query}`);
      const data = await response.json() as { total?:number; participantes?:Participant[]; message?:string };
      if (!response.ok) throw new Error(data.message);
      setParticipants(data.participantes ?? []); setParticipantTotal(data.total ?? 0);
    } catch {
      setParticipants([]); setParticipantTotal(0); setDetailMessage('Não foi possível carregar os participantes.');
    } finally { setDetailLoading(false); }
  }

  function openDetails(filter:DetailFilter) {
    setDetail(filter); setParticipantSearch('');
    void loadParticipants(filter);
    window.setTimeout(() => document.getElementById('dashboard-details')?.scrollIntoView({ behavior:'smooth', block:'start' }),0);
  }

  function searchParticipants(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detail) void loadParticipants(detail,participantSearch);
  }

  const wheelTotals = useMemo(() => metrics?.roleta.reduce((total,row) => ({
    total:total.total+row.total,
    utilizados:total.utilizados+row.utilizados,
    disponiveis:total.disponiveis+row.disponiveis,
  }), { total:0, utilizados:0, disponiveis:0 }) ?? { total:0, utilizados:0, disponiveis:0 },[metrics]);

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <Image className="admin-logo" src="/logo-qualitycert.png" alt="Qualitycert" width={221} height={50} priority />
      <nav className="admin-nav" aria-label="Navegação administrativa">
        {isAdmin && <Link href="/gerenciadorEventos"><span>▦</span> Eventos</Link>}
        <Link className="is-active" href="/dashboard"><span>▥</span> Dashboard</Link>
        <Link href="/pesquisar"><span>⌕</span> Pesquisar ganhador</Link>
      </nav>
      <div className="admin-sidebar-footer"><small>Painel administrativo</small><strong>Qualitycert Eventos</strong></div>
    </aside>
    <section className="admin-main">
      <header className="admin-topbar"><div><p>Análise</p><h1>Dashboard</h1></div><form action="/api/auth/logout" method="post"><button className="admin-logout-button" type="submit">Sair</button></form></header>
      <section className="admin-panel dashboard-filter-panel">
        <div className="admin-panel-header"><div><h2>Evento analisado</h2><p>Selecione um evento para visualizar os resultados de cada interação.</p></div></div>
        <label className="admin-field dashboard-event-filter"><span>Evento</span><select value={eventId} onChange={(event) => void changeEvent(event.target.value)}><option value="">Selecione um evento</option>{events.map((event) => <option key={event.id} value={event.id}>{event.nomeEvento} — {event.ativo ? 'Ativo' : 'Inativo'}</option>)}</select></label>
      </section>
      {loading && <p className="dashboard-feedback">Carregando indicadores…</p>}
      {!loading && message && <p className="admin-form-error dashboard-feedback">{message}</p>}
      {!loading && !message && !metrics && <section className="dashboard-empty"><strong>Selecione um evento</strong><span>Os indicadores de Sorteio e Roleta aparecerão aqui.</span></section>}
      {!loading && metrics && <>
        <section className="dashboard-event-summary"><div><span>Evento</span><strong>{metrics.evento.nomeEvento}</strong></div><div><span>Prefixo</span><strong>{metrics.evento.prefixo}</strong></div><div><span>Período</span><strong>{formatDate(metrics.evento.dataInicio)} a {formatDate(metrics.evento.dataFinal)}</strong></div><div><span>Status</span><strong className={metrics.evento.ativo ? 'dashboard-active' : 'dashboard-inactive'}>{metrics.evento.ativo ? 'Ativo' : 'Inativo'}</strong></div></section>
        <section className="dashboard-interaction-block">
          <div className="dashboard-section-heading"><div><span>Sorteio</span><h2>Visão geral dos códigos</h2></div></div>
          <div className="admin-metrics dashboard-metrics"><article><span>Total de códigos</span><strong>{metrics.sorteio.total}</strong></article><article><span>Disponíveis</span><strong>{metrics.sorteio.disponiveis}</strong></article><article className="dashboard-clickable-metric"><button type="button" disabled={!metrics.sorteio.utilizados} onClick={() => openDetails({ interacao:'sorteio' })}><span>Utilizados · ver participantes</span><strong>{metrics.sorteio.utilizados}</strong></button></article></div>
        </section>
        <section className="dashboard-interaction-block">
          <div className="dashboard-section-heading"><div><span>Roleta</span><h2>Códigos por quantidade de certificados</h2></div><div className="dashboard-wheel-summary"><small>{wheelTotals.total} códigos · {wheelTotals.utilizados} utilizados · {wheelTotals.disponiveis} disponíveis</small><button type="button" disabled={!wheelTotals.utilizados} onClick={() => openDetails({ interacao:'roleta' })}>Ver todos utilizados</button></div></div>
          {metrics.roleta.length ? <div className="admin-table-wrap"><table className="admin-table dashboard-table"><thead><tr><th>Certificados por código</th><th>Total de códigos</th><th>Utilizados</th><th>Disponíveis</th></tr></thead><tbody>{metrics.roleta.map((row) => <tr key={row.quantidadeCertificados}><td><strong>{row.quantidadeCertificados}</strong></td><td>{row.total}</td><td>{row.utilizados ? <button className="dashboard-detail-link" type="button" onClick={() => openDetails({ interacao:'roleta', quantidadeCertificados:row.quantidadeCertificados })}>{row.utilizados} · ver participantes</button> : 0}</td><td>{row.disponiveis}</td></tr>)}</tbody></table></div> : <div className="dashboard-no-interaction">Nenhuma interação de Roleta cadastrada neste evento.</div>}
        </section>
        {detail && <section className="dashboard-interaction-block dashboard-details" id="dashboard-details">
          <div className="dashboard-section-heading"><div><span>Participantes utilizados</span><h2>{detail.interacao === 'sorteio' ? 'Sorteio' : detail.quantidadeCertificados ? `Roleta · ${detail.quantidadeCertificados} certificados` : 'Roleta · todos os certificados'}</h2></div><button className="dashboard-close-details" type="button" onClick={() => setDetail(null)}>Fechar</button></div>
          <form className="dashboard-participant-search" onSubmit={searchParticipants}><label className="admin-field"><span>Pesquisar por nome</span><input value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} maxLength={160} placeholder="Digite o nome do participante" /></label><button className="admin-primary-button" type="submit">Pesquisar</button><button className="admin-secondary-button" type="button" onClick={() => { setParticipantSearch(''); void loadParticipants(detail); }}>Limpar</button></form>
          <p className="dashboard-result-count">{participantTotal} participante{participantTotal === 1 ? '' : 's'} encontrado{participantTotal === 1 ? '' : 's'}{participantTotal > 200 ? ' · exibindo os 200 mais recentes' : ''}</p>
          {detailLoading ? <p className="dashboard-detail-feedback">Carregando participantes…</p> : detailMessage ? <p className="admin-form-error dashboard-detail-feedback">{detailMessage}</p> : participants.length ? <div className="admin-table-wrap"><table className="admin-table dashboard-participant-table"><thead><tr><th>Código</th><th>Participante</th>{detail.interacao === 'roleta' && <th>Certificados</th>}<th>Telefone</th><th>E-mail</th><th>CPF</th><th>Contabilidade</th><th>Cadastro</th></tr></thead><tbody>{participants.map((participant) => <tr key={participant.id}><td><strong>{participant.codigo}</strong></td><td><strong>{participant.nome}</strong></td>{detail.interacao === 'roleta' && <td>{participant.quantidadeCertificados}</td>}<td>{participant.telefone}</td><td>{participant.email}</td><td>{maskCpf(participant.cpf)}</td><td>{participant.contabilidade}</td><td>{participant.preenchidoEm ? new Date(participant.preenchidoEm).toLocaleString('pt-BR') : 'Não informado'}</td></tr>)}</tbody></table></div> : <div className="dashboard-no-interaction">Nenhum participante encontrado para este filtro.</div>}
        </section>}
      </>}
    </section>
  </main>;
}
