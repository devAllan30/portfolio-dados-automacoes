'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type InteractionType = 'sorteio' | 'roleta';
type GeneratedCode = { codigo: string; link?: string; certificados?: number };
type WheelBatch = { id: number; quantidadeCodigos: string; quantidadeCertificados: string };
type EventItem = {
  id: number;
  nomeEvento: string;
  prefixo: string;
  dataCriacao: string;
  dataInicio: string | null;
  dataFinal: string | null;
  premio: string | null;
  tipoInteracao: string;
  ativo: boolean;
  ganhador: string | null;
  ganhadorCodigo: string | null;
  totalCodigos: number;
  totalUtilizados: number;
};
type CreatedEvent = {
  eventoId: number;
  eventoNome: string;
  prefixo: string;
  dataInicio: string;
  dataFinal: string;
};
type LinkedInteraction = {
  eventoId: number;
  eventoNome: string;
  prefixo: string;
  interacao: InteractionType;
  quantidade: number;
  codigos: GeneratedCode[];
};

function formatDate(value: string | null) {
  if (!value) return 'Não definida';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function todayBrazil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function eventStatus(event: EventItem) {
  if (!event.ativo) return { label: 'Inativo', className: 'is-inactive' };
  if (!event.dataInicio || !event.dataFinal) return { label: 'Pendente', className: 'is-pending' };
  const today = todayBrazil();
  const start = event.dataInicio.slice(0, 10);
  const end = event.dataFinal.slice(0, 10);
  if (today < start) return { label: 'Agendado', className: 'is-scheduled' };
  if (today > end) return { label: 'Encerrado', className: 'is-closed' };
  return { label: 'Em andamento', className: 'is-active' };
}

function eventExpired(event: EventItem) {
  return Boolean(event.dataFinal && event.dataFinal.slice(0, 10) < todayBrazil());
}

export default function GerenciadorEventos() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nomeEvento, setNomeEvento] = useState('');
  const [prefixo, setPrefixo] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [created, setCreated] = useState<CreatedEvent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [interactionEvent, setInteractionEvent] = useState<EventItem | null>(null);
  const [interaction, setInteraction] = useState<InteractionType | ''>('');
  const [interactionPremio, setInteractionPremio] = useState('');
  const [wheelAwardRule, setWheelAwardRule] = useState('');
  const [quantidade, setQuantidade] = useState(100);
  const [wheelBatches, setWheelBatches] = useState<WheelBatch[]>([{ id: 1, quantidadeCodigos: '', quantidadeCertificados: '' }]);
  const [linkedInteraction, setLinkedInteraction] = useState<LinkedInteraction | null>(null);
  const [linkingInteraction, setLinkingInteraction] = useState(false);
  const [interactionMessage, setInteractionMessage] = useState('');
  const [changingEventId, setChangingEventId] = useState<number | null>(null);
  const [downloadingInteraction, setDownloadingInteraction] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);
  const [userLogin, setUserLogin] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userType, setUserType] = useState<'User' | 'Admin'>('User');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [createdUser, setCreatedUser] = useState('');

  const loadEvents = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/eventos');
      const data = await response.json() as { eventos?: EventItem[] };
      setEvents(data.eventos ?? []);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const metrics = useMemo(() => ({
    total: events.length,
    active: events.filter((event) => event.ativo).length,
    participations: events.reduce((total, event) => total + event.totalUtilizados, 0),
    winners: events.filter((event) => event.ganhador).length,
  }), [events]);
  const filteredEvents = useMemo(() => events.filter((event) => activeFilter === 'all' || event.ativo === (activeFilter === 'active')), [events, activeFilter]);

  async function changeEventStatus(event: EventItem) {
    const nextActive = !event.ativo;
    if (!nextActive && !window.confirm(`Desativar o evento "${event.nomeEvento}" e todos os seus códigos?`)) return;
    setChangingEventId(event.id);
    setStatusMessage('');
    try {
      const response = await fetch(`/api/admin/eventos/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: nextActive }),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) {
        setStatusMessage(data.message ?? 'Não foi possível alterar o evento.');
        return;
      }
      setEvents((current) => current.map((item) => item.id === event.id ? { ...item, ativo: nextActive } : item));
      setStatusMessage(nextActive ? 'Evento e códigos ativados.' : 'Evento e códigos desativados.');
    } catch {
      setStatusMessage('Falha de conexão ao alterar o evento.');
    } finally {
      setChangingEventId(null);
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeEvento, prefixo, dataInicio, dataFinal }),
      });
      const data = await response.json() as CreatedEvent & { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? 'Não foi possível criar o evento.');
        return;
      }
      setCreated(data);
      await loadEvents();
    } catch {
      setMessage('Falha de conexão. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingUser(true);
    setUserMessage('');
    setCreatedUser('');
    try {
      const response = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: userLogin, senha: userPassword, tipo: userType }),
      });
      const data = await response.json() as { login?: string; message?: string };
      if (!response.ok || !data.login) {
        setUserMessage(data.message ?? 'Não foi possível criar o usuário.');
        return;
      }
      setCreatedUser(data.login);
      setUserLogin('');
      setUserPassword('');
      setUserType('User');
    } catch {
      setUserMessage('Falha de conexão. Tente novamente.');
    } finally {
      setCreatingUser(false);
    }
  }

  async function linkInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactionEvent || !interaction) return;
    setLinkingInteraction(true);
    setInteractionMessage('');
    try {
      const response = await fetch(`/api/admin/eventos/${interactionEvent.id}/interacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interaction === 'sorteio'
          ? { interacao: interaction, premio: interactionPremio, quantidade }
          : { interacao: interaction, regraPremiacao: wheelAwardRule, lotes: wheelBatches.map((item) => ({ quantidadeCodigos: Number(item.quantidadeCodigos), quantidadeCertificados: Number(item.quantidadeCertificados) })) }),
      });
      const data = await response.json() as Omit<LinkedInteraction, 'eventoNome'> & { message?: string };
      if (!response.ok) {
        setInteractionMessage(data.message ?? 'Não foi possível vincular a interação.');
        return;
      }
      setLinkedInteraction({ ...data, eventoNome: interactionEvent.nomeEvento });
      await loadEvents();
    } catch {
      setInteractionMessage('Falha de conexão. Tente novamente.');
    } finally {
      setLinkingInteraction(false);
    }
  }

  function saveInteractionCsv(data: LinkedInteraction) {
    const rows = data.interacao === 'roleta'
      ? [['evento_id', 'evento', 'codigo_roleta', 'quantidade_certificados', 'link'], ...data.codigos.map((item) => [String(data.eventoId), data.eventoNome, item.codigo, String(item.certificados ?? ''), item.link ?? ''])]
      : [['evento_id', 'evento', 'codigo_sorteio', 'link'], ...data.codigos.map((item) => [String(data.eventoId), data.eventoNome, item.codigo, item.link ?? ''])];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${data.prefixo}-${data.eventoId}-${data.interacao}-codigos.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsv() {
    if (linkedInteraction) saveInteractionCsv(linkedInteraction);
  }

  async function downloadExistingInteraction(event: EventItem, interacao: InteractionType) {
    const key = `${event.id}-${interacao}`;
    setDownloadingInteraction(key);
    setStatusMessage('');
    try {
      const response = await fetch(`/api/admin/eventos/${event.id}/interacoes?interacao=${interacao}`);
      const data = await response.json() as LinkedInteraction & { message?: string };
      if (!response.ok) {
        setStatusMessage(data.message ?? 'Não foi possível exportar os códigos.');
        return;
      }
      saveInteractionCsv(data);
      setStatusMessage(`CSV de ${interacao === 'sorteio' ? 'Sorteio' : 'Roleta'} gerado para ${event.nomeEvento}.`);
    } catch {
      setStatusMessage('Falha de conexão ao exportar os códigos.');
    } finally {
      setDownloadingInteraction('');
    }
  }

  function closeForm() {
    setShowForm(false);
    setCreated(null);
    setNomeEvento('');
    setPrefixo('');
    setDataInicio('');
    setDataFinal('');
    setMessage('');
  }

  function closeUserForm() {
    setShowUserForm(false);
    setUserLogin('');
    setUserPassword('');
    setUserType('User');
    setUserMessage('');
    setCreatedUser('');
  }

  function openInteraction(event: EventItem) {
    setInteractionEvent(event);
    setInteraction('');
    setInteractionPremio('');
    setWheelAwardRule('');
    setQuantidade(100);
    setWheelBatches([{ id: 1, quantidadeCodigos: '', quantidadeCertificados: '' }]);
    setLinkedInteraction(null);
    setInteractionMessage('');
  }

  function closeInteraction() {
    setInteractionEvent(null);
    setInteraction('');
    setInteractionPremio('');
    setWheelAwardRule('');
    setQuantidade(100);
    setWheelBatches([{ id: 1, quantidadeCodigos: '', quantidadeCertificados: '' }]);
    setLinkedInteraction(null);
    setInteractionMessage('');
  }

  function addWheelBatch() {
    setWheelBatches((current) => [...current, { id: Math.max(...current.map((item) => item.id), 0) + 1, quantidadeCodigos: '', quantidadeCertificados: '' }]);
  }

  function updateWheelBatch(id: number, field: 'quantidadeCodigos' | 'quantidadeCertificados', value: string) {
    setWheelBatches((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  function removeWheelBatch(id: number) {
    setWheelBatches((current) => current.length > 1 ? current.filter((item) => item.id !== id) : current);
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Image className="admin-logo" src="/logo-qualitycert.png" alt="Qualitycert" width={221} height={50} priority />
        <nav className="admin-nav" aria-label="Navegação administrativa">
          <Link className="is-active" href="/gerenciadorEventos"><span>▦</span> Eventos</Link>
          <Link href="/dashboard"><span>▥</span> Dashboard</Link>
          <Link href="/pesquisar"><span>⌕</span> Pesquisar ganhador</Link>
        </nav>
        <div className="admin-sidebar-footer"><small>Painel administrativo</small><strong>Qualitycert Eventos</strong></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar admin-manager-topbar">
          <div><p>Administração</p><h1>Gerenciador de eventos</h1></div>
          <div className="admin-topbar-actions">
            <form action="/api/auth/logout" method="post"><button className="admin-logout-button" type="submit">Sair</button></form>
            <button className="admin-secondary-button" type="button" onClick={() => setShowUserForm(true)}>+ Novo usuário</button>
            <button className="admin-primary-button" type="button" onClick={() => setShowForm(true)}>+ Novo evento</button>
          </div>
        </header>

        <section className="admin-metrics" aria-label="Resumo dos eventos">
          <article><span>Eventos cadastrados</span><strong>{metrics.total}</strong></article>
          <article><span>Eventos ativos</span><strong>{metrics.active}</strong></article>
          <article><span>Participações</span><strong>{metrics.participations}</strong></article>
          <article><span>Ganhadores definidos</span><strong>{metrics.winners}</strong></article>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <div><h2>Eventos</h2><p>Cadastro, período, interação, ativação e resultado.</p></div>
            <div className="admin-panel-actions"><label className="admin-status-filter"><span>Status</span><select aria-label="Filtrar eventos por status" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as 'all' | 'active' | 'inactive')}><option value="all">Todos ({events.length})</option><option value="active">Ativos ({metrics.active})</option><option value="inactive">Inativos ({events.length - metrics.active})</option></select></label><button type="button" className="admin-refresh" onClick={() => void loadEvents()}>↻ Atualizar</button></div>
          </div>

          {statusMessage && <p className="admin-panel-message" role="status">{statusMessage}</p>}

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Evento</th><th>Período</th><th>Interação</th><th>Prêmio</th><th>Participações</th><th>Ganhador</th><th>Status e controle</th></tr></thead>
              <tbody>
                {filteredEvents.map((event) => {
                  const status = eventStatus(event);
                  return (
                    <tr key={event.id}>
                      <td><div className="admin-event-cell"><div><strong>{event.nomeEvento}</strong><small>ID {event.id} · Prefixo {event.prefixo}</small></div><button type="button" className="admin-add-interaction" aria-label={`Adicionar interação ao evento ${event.nomeEvento}`} title="Adicionar interação" onClick={() => openInteraction(event)}>+</button></div></td>
                      <td>{formatDate(event.dataInicio)}<small>até {formatDate(event.dataFinal)}</small></td>
                      <td><div className="admin-interaction-cell">{event.tipoInteracao ? event.tipoInteracao.split(',').map((item) => { const interactionType = item as InteractionType; const downloadKey = `${event.id}-${interactionType}`; return <button type="button" className="admin-type-badge admin-type-button" key={item} disabled={downloadingInteraction === downloadKey} title="Baixar códigos em CSV" onClick={() => void downloadExistingInteraction(event, interactionType)}>{downloadingInteraction === downloadKey ? 'Gerando…' : interactionType === 'sorteio' ? 'Sorteio ↓' : 'Roleta ↓'}</button>; }) : <span className="admin-muted">Nenhuma</span>}</div></td>
                      <td>{event.premio ?? 'Não informado'}</td>
                      <td><strong>{event.totalUtilizados}</strong><small>de {event.totalCodigos} códigos</small></td>
                      <td>{event.ganhador ? <><strong>{event.ganhador}</strong><small>{event.ganhadorCodigo}</small></> : <span className="admin-muted">Não definido</span>}</td>
                      <td><div className="admin-status-control"><span className={`admin-status ${status.className}`}>{status.label}</span><button className={`admin-activation-button ${event.ativo ? 'is-deactivate' : 'is-activate'}`} type="button" disabled={changingEventId === event.id || (!event.ativo && eventExpired(event))} onClick={() => void changeEventStatus(event)}>{changingEventId === event.id ? 'Salvando…' : event.ativo ? 'Desativar' : eventExpired(event) ? 'Expirado' : 'Ativar'}</button></div></td>
                    </tr>
                  );
                })}
                {!loadingEvents && !filteredEvents.length && <tr><td colSpan={7} className="admin-empty">{events.length ? 'Nenhum evento encontrado neste filtro.' : 'Nenhum evento cadastrado.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {showForm && (
        <div className="admin-modal-backdrop" role="presentation">
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="new-event-title">
            <header><div><p>Novo cadastro</p><h2 id="new-event-title">Criar evento</h2></div><button type="button" onClick={closeForm} aria-label="Fechar">×</button></header>
            {created ? (
              <div className="admin-created">
                <span>✓</span><h3>Evento criado com sucesso</h3>
                <p><strong>{created.eventoNome}</strong> recebeu o ID <strong>{created.eventoId}</strong>. Use o botão <strong>+</strong> da listagem para vincular uma interação.</p>
                <div><button className="admin-primary-button" type="button" onClick={closeForm}>Concluir</button></div>
              </div>
            ) : (
              <form className="admin-form" onSubmit={createEvent}>
                <label className="admin-field admin-field-wide"><span>Nome do evento</span><input required minLength={3} maxLength={220} value={nomeEvento} onChange={(e) => setNomeEvento(e.target.value)} /></label>
                <label className="admin-field"><span>Prefixo</span><input required minLength={3} maxLength={3} value={prefixo} onChange={(e) => setPrefixo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC" /></label>
                <label className="admin-field"><span>Data inicial</span><input required type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} /></label>
                <label className="admin-field"><span>Data final</span><input required type="date" min={dataInicio} value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} /></label>
                {message && <p className="admin-form-error" role="alert">{message}</p>}
                <footer><button className="admin-secondary-button" type="button" onClick={closeForm}>Cancelar</button><button className="admin-primary-button" type="submit" disabled={submitting}>{submitting ? 'Criando…' : 'Criar evento'}</button></footer>
              </form>
            )}
          </section>
        </div>
      )}

      {showUserForm && (
        <div className="admin-modal-backdrop" role="presentation">
          <section className="admin-modal admin-user-modal" role="dialog" aria-modal="true" aria-labelledby="new-user-title">
            <header><div><p>Controle de acesso</p><h2 id="new-user-title">Criar usuário</h2></div><button type="button" onClick={closeUserForm} aria-label="Fechar">×</button></header>
            {createdUser ? (
              <div className="admin-created">
                <span>✓</span><h3>Usuário criado com sucesso</h3>
                <p>O login <strong>{createdUser}</strong> já pode acessar o sistema com o perfil selecionado.</p>
                <div><button className="admin-primary-button" type="button" onClick={() => setCreatedUser('')}>Criar outro usuário</button><button className="admin-secondary-button" type="button" onClick={closeUserForm}>Concluir</button></div>
              </div>
            ) : (
              <form className="admin-form" onSubmit={createUser}>
                <label className="admin-field admin-field-wide"><span>Login</span><input required autoFocus minLength={3} maxLength={100} autoComplete="off" value={userLogin} onChange={(event) => setUserLogin(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} placeholder="nome.usuario" /><small>Use letras, números, ponto, hífen ou sublinhado.</small></label>
                <label className="admin-field admin-field-wide"><span>Senha</span><input required type="password" minLength={8} maxLength={255} autoComplete="new-password" value={userPassword} onChange={(event) => setUserPassword(event.target.value)} /><small>Mínimo de 8 caracteres. A senha será armazenada em texto puro.</small></label>
                <label className="admin-field admin-field-wide"><span>Tipo</span><select value={userType} onChange={(event) => setUserType(event.target.value as 'User' | 'Admin')}><option value="User">User — somente Pesquisa</option><option value="Admin">Admin — Gerenciador e Pesquisa</option></select></label>
                {userMessage && <p className="admin-form-error" role="alert">{userMessage}</p>}
                <footer><button className="admin-secondary-button" type="button" onClick={closeUserForm}>Cancelar</button><button className="admin-primary-button" type="submit" disabled={creatingUser}>{creatingUser ? 'Criando…' : 'Criar usuário'}</button></footer>
              </form>
            )}
          </section>
        </div>
      )}

      {interactionEvent && (
        <div className="admin-modal-backdrop" role="presentation">
          <section className="admin-modal admin-interaction-modal" role="dialog" aria-modal="true" aria-labelledby="interaction-title">
            <header><div><p>Evento {interactionEvent.id}</p><h2 id="interaction-title">Vincular interação</h2></div><button type="button" onClick={closeInteraction} aria-label="Fechar">×</button></header>
            {linkedInteraction ? (
              <div className="admin-created">
                <span>✓</span><h3>{linkedInteraction.interacao === 'sorteio' ? 'Sorteio vinculado' : 'Roleta vinculada'}</h3>
                <p><strong>{linkedInteraction.quantidade}</strong> códigos foram gerados para <strong>{linkedInteraction.eventoNome}</strong>.</p>
                <div><button className="admin-primary-button" type="button" onClick={downloadCsv}>Baixar CSV</button><button className="admin-secondary-button" type="button" onClick={closeInteraction}>Concluir</button></div>
              </div>
            ) : (
              <form className="admin-form" onSubmit={linkInteraction}>
                <div className="admin-event-reference"><span>Evento</span><strong>{interactionEvent.nomeEvento}</strong><small>Prefixo {interactionEvent.prefixo}</small></div>
                <fieldset className="admin-interactions">
                  <legend>Selecione a interação</legend>
                  <label className={`${interaction === 'sorteio' ? 'is-selected' : ''} ${interactionEvent.tipoInteracao.split(',').includes('sorteio') ? 'is-disabled' : ''}`}>
                    <input type="checkbox" disabled={interactionEvent.tipoInteracao.split(',').includes('sorteio')} checked={interaction === 'sorteio' || interactionEvent.tipoInteracao.split(',').includes('sorteio')} onChange={(e) => setInteraction(e.target.checked ? 'sorteio' : '')} />
                    <span><strong>Sorteio</strong><small>{interactionEvent.tipoInteracao.split(',').includes('sorteio') ? 'Já vinculado' : 'Gerar códigos para participantes'}</small></span>
                  </label>
                  <label className={`${interaction === 'roleta' ? 'is-selected' : ''} ${interactionEvent.tipoInteracao.split(',').includes('roleta') ? 'is-disabled' : ''}`}>
                    <input type="checkbox" disabled={interactionEvent.tipoInteracao.split(',').includes('roleta')} checked={interaction === 'roleta' || interactionEvent.tipoInteracao.split(',').includes('roleta')} onChange={(e) => setInteraction(e.target.checked ? 'roleta' : '')} />
                    <span><strong>Roleta</strong><small>{interactionEvent.tipoInteracao.split(',').includes('roleta') ? 'Já vinculada' : 'Gerar códigos com certificados'}</small></span>
                  </label>
                </fieldset>
                {interaction === 'sorteio' && <><label className="admin-field admin-field-wide"><span>Prêmio do Sorteio</span><input required maxLength={255} value={interactionPremio} onChange={(e) => setInteractionPremio(e.target.value)} /></label><label className="admin-field admin-field-wide"><span>Quantidade de códigos</span><input required type="number" min={1} max={10000} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} /><small>De 1 a 10.000 códigos. Formato: {interactionEvent.prefixo} + 4 números.</small></label></>}
                {interaction === 'roleta' && <><label className="admin-field admin-field-wide"><span>Regra Premiação</span><textarea required maxLength={2000} rows={4} value={wheelAwardRule} onChange={(e) => setWheelAwardRule(e.target.value)} placeholder="Informe a regra de premiação que será exibida ao participante." /><small>Este texto será apresentado na tela do voucher da Roleta.</small></label><section className="admin-wheel-options"><div className="admin-wheel-heading"><div><strong>Distribuição de certificados</strong><small>Cada código receberá a quantidade de certificados informada na mesma linha.</small></div><button type="button" onClick={addWheelBatch}>+ Adicionar</button></div>{wheelBatches.map((item, index) => <div className="admin-wheel-row" key={item.id}><span>{index + 1}</span><label className="admin-field"><span>Quantidade de códigos</span><input required type="number" min={1} max={10000} value={item.quantidadeCodigos} onChange={(e) => updateWheelBatch(item.id, 'quantidadeCodigos', e.target.value)} /></label><label className="admin-field"><span>Certificados por código</span><input required type="number" min={1} max={4294967295} value={item.quantidadeCertificados} onChange={(e) => updateWheelBatch(item.id, 'quantidadeCertificados', e.target.value)} /></label><button className="admin-wheel-remove" type="button" disabled={wheelBatches.length === 1} aria-label={`Remover linha ${index + 1}`} onClick={() => removeWheelBatch(item.id)}>×</button></div>)}</section></>}
                {interactionMessage && <p className="admin-form-error" role="alert">{interactionMessage}</p>}
                <footer><button className="admin-secondary-button" type="button" onClick={closeInteraction}>Cancelar</button><button className="admin-primary-button" type="submit" disabled={linkingInteraction || !interaction}>{linkingInteraction ? 'Vinculando…' : 'Vincular e gerar códigos'}</button></footer>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
