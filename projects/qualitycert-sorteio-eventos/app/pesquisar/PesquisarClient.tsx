'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type EventOption = {
  id: number;
  nomeEvento: string;
  prefixo: string;
  dataInicio: string | null;
  dataFinal: string | null;
  premio: string | null;
  ganhador: string | null;
  ganhadorCodigo: string | null;
  totalUtilizados: number;
};
type CodeSuggestion = { codigo: string };
type Winner = {
  eventoId: number;
  eventoNome: string;
  codigo: string;
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  contabilidade: string;
  cnpj: string | null;
  preenchidoEm: string | null;
};

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 97);
}
function maskCpf(value: string) { return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
function maskCnpj(value: string) { return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); }

export default function PesquisarGanhador({ isAdmin }: Readonly<{ isAdmin: boolean }>) {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState('');
  const [suffix, setSuffix] = useState('');
  const [suggestions, setSuggestions] = useState<CodeSuggestion[]>([]);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');

  const selectedEvent = useMemo(() => events.find((event) => String(event.id) === eventId) ?? null, [events, eventId]);
  const fullCode = selectedEvent ? `${selectedEvent.prefixo}${suffix}` : '';

  useEffect(() => {
    fetch('/api/admin/ganhadores/eventos')
      .then((response) => response.json())
      .then((data: { eventos?: EventOption[] }) => setEvents(data.eventos ?? []))
      .catch(() => setMessage('Não foi possível carregar os eventos.'));
  }, []);

  useEffect(() => {
    if (!selectedEvent || suffix.length < 1 || winner?.codigo === fullCode) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setMessage('');
      try {
        const response = await fetch(`/api/admin/ganhadores?eventoId=${selectedEvent.id}&codigo=${encodeURIComponent(fullCode)}`, { signal: controller.signal });
        const data = await response.json() as { codigos?: CodeSuggestion[]; message?: string };
        if (!response.ok) throw new Error(data.message);
        setSuggestions(data.codigos ?? []);
        if (!data.codigos?.length) setMessage('Nenhum código utilizado encontrado neste evento.');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setMessage('Não foi possível pesquisar os códigos.');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [selectedEvent, suffix, fullCode, winner?.codigo]);

  function changeEvent(value: string) {
    setEventId(value);
    setSuffix('');
    setSuggestions([]);
    setWinner(null);
    setConfirmed(false);
    setMessage('');
  }

  async function selectCode(codigo: string) {
    if (!selectedEvent) return;
    setSuffix(codigo.slice(selectedEvent.prefixo.length));
    setSuggestions([]);
    setSearching(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/ganhadores/${encodeURIComponent(codigo)}?eventoId=${selectedEvent.id}`);
      const data = await response.json() as Winner & { message?: string };
      if (!response.ok) { setMessage(data.message ?? 'Não foi possível carregar a participação.'); return; }
      setWinner(data);
    } catch {
      setMessage('Falha de conexão. Tente novamente.');
    } finally {
      setSearching(false);
    }
  }

  async function confirmWinner() {
    if (!winner || !selectedEvent) return;
    setSelecting(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/ganhadores/${encodeURIComponent(winner.codigo)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventoId: selectedEvent.id }),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) { setMessage(data.message ?? 'Não foi possível selecionar o ganhador.'); return; }
      setConfirmed(true);
      setEvents((current) => current.map((event) => event.id === selectedEvent.id ? { ...event, ganhador: winner.nome, ganhadorCodigo: winner.codigo } : event));
    } catch {
      setMessage('Falha de conexão. Tente novamente.');
    } finally {
      setSelecting(false);
    }
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Image className="admin-logo" src="/logo-qualitycert.png" alt="Qualitycert" width={221} height={50} priority />
        <nav className="admin-nav" aria-label="Navegação administrativa">
          {isAdmin && <Link href="/gerenciadorEventos"><span>▦</span> Eventos</Link>}
          <Link href="/dashboard"><span>▥</span> Dashboard</Link>
          <div className="admin-nav-current is-active"><span>⌕</span> Pesquisar ganhador</div>
        </nav>
        <div className="admin-sidebar-footer"><small>Painel administrativo</small><strong>Qualitycert Eventos</strong></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><p>Resultado</p><h1>Pesquisar ganhador</h1></div><form action="/api/auth/logout" method="post"><button className="admin-logout-button" type="submit">Sair</button></form></header>
        <section className="admin-panel winner-admin-panel">
          <div className="admin-panel-header"><div><h2>Localizar participação</h2><p>Selecione o evento antes de informar o código sorteado.</p></div></div>

          <div className="winner-admin-flow">
            <label className="admin-field admin-field-wide"><span>1. Evento</span><select value={eventId} onChange={(e) => changeEvent(e.target.value)}><option value="">Selecione um evento</option>{events.map((event) => <option key={event.id} value={event.id}>{event.nomeEvento} — ID {event.id}</option>)}</select></label>

            {selectedEvent && (
              <>
                <div className="selected-event-summary">
                  <div><span>Evento</span><strong>{selectedEvent.nomeEvento}</strong></div>
                  <div><span>Prêmio</span><strong>{selectedEvent.premio ?? 'Não informado'}</strong></div>
                  <div><span>Participações</span><strong>{selectedEvent.totalUtilizados}</strong></div>
                  <div><span>Ganhador</span><strong>{selectedEvent.ganhador ?? 'Ainda não definido'}</strong></div>
                </div>

                <label className="admin-field admin-field-wide"><span>2. Código sorteado</span><div className="locked-code-input"><strong>{selectedEvent.prefixo}</strong><input value={suffix} onChange={(e) => { setSuffix(normalizeCode(e.target.value)); setSuggestions([]); setWinner(null); setConfirmed(false); setMessage(''); }} placeholder="Digite o restante do código" autoComplete="off" /></div></label>

                {searching && <p className="admin-search-feedback" role="status">Pesquisando participações…</p>}
                {!searching && message && <p className="admin-form-error" role="status">{message}</p>}
                {suggestions.length > 0 && <div className="admin-code-suggestions" role="listbox" aria-label="Códigos encontrados">{suggestions.map((item) => <button key={item.codigo} type="button" role="option" aria-selected="false" onClick={() => selectCode(item.codigo)}><strong>{item.codigo}</strong><span>Participação confirmada</span></button>)}</div>}

                {winner && (
                  <section className="admin-winner-result" aria-label="Informações do ganhador">
                    <header><div><span>Participação localizada</span><h3>{winner.nome}</h3></div><code>{winner.codigo}</code></header>
                    <dl>
                      <div><dt>Telefone</dt><dd>{winner.telefone}</dd></div><div><dt>E-mail</dt><dd>{winner.email}</dd></div>
                      <div><dt>CPF</dt><dd>{maskCpf(winner.cpf)}</dd></div><div><dt>Contabilidade</dt><dd>{winner.contabilidade}</dd></div>
                      <div><dt>CNPJ</dt><dd>{winner.cnpj ? maskCnpj(winner.cnpj) : 'Não informado'}</dd></div><div><dt>Data da participação</dt><dd>{winner.preenchidoEm ? new Date(winner.preenchidoEm).toLocaleString('pt-BR') : 'Não informada'}</dd></div>
                    </dl>
                    {confirmed ? <div className="winner-confirmed">✓ Ganhador registrado!</div> : <button className="admin-primary-button select-winner-button" type="button" disabled={selecting || Boolean(selectedEvent.ganhador)} onClick={confirmWinner}>{selectedEvent.ganhador ? 'Evento já possui ganhador' : selecting ? 'Registrando…' : 'Selecionar como ganhador'}</button>}
                  </section>
                )}
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
