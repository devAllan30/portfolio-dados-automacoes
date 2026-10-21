'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';

type FormState = { nome:string; telefone:string; email:string; cpf:string; contabilidade:string; cnpj:string };
type CodeStatus = 'carregando' | 'disponivel' | 'utilizado' | 'inativo' | 'invalido' | 'erro';
const initialForm: FormState = { nome:'', telefone:'', email:'', cpf:'', contabilidade:'', cnpj:'' };

function decodedParam(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function eventLabel(value: string) {
  return decodedParam(value).replace(/[-_]+/g, ' ').replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2');
}

function onlyDigits(value: string) { return value.replace(/\D/g, ''); }
function maskCpf(value: string) {
  return onlyDigits(value).slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
}
function maskCnpj(value: string) {
  return onlyDigits(value).slice(0,14).replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2');
}
function maskPhone(value: string) {
  const number = onlyDigits(value).slice(0,11);
  if (number.length <= 10) return number.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d)/,'$1-$2');
  return number.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2');
}

export default function CadastroParticipante() {
  const params = useParams<{ evento:string; codigo:string }>() ?? { evento:'', codigo:'' };
  const [form,setForm] = useState(initialForm);
  const [status,setStatus] = useState<CodeStatus>('carregando');
  const [displayEvent,setDisplayEvent] = useState('');
  const [premio,setPremio] = useState('');
  const [submitting,setSubmitting] = useState(false);
  const [message,setMessage] = useState('');
  const [complete,setComplete] = useState(false);
  const eventKey = useMemo(() => decodedParam(params.evento),[params.evento]);
  const code = useMemo(() => decodedParam(params.codigo),[params.codigo]);
  const fallbackEvent = useMemo(() => eventLabel(eventKey),[eventKey]);

  useEffect(() => {
    let active = true;
    fetch(`/api/eventos/${encodeURIComponent(eventKey)}/${encodeURIComponent(code)}`)
      .then(async (response) => {
        const data = await response.json() as { status:CodeStatus; eventoNome?:string; premio?:string|null };
        if (!active) return;
        setStatus(response.ok ? data.status : data.status === 'invalido' || data.status === 'inativo' ? data.status : 'erro');
        setDisplayEvent(data.eventoNome ?? fallbackEvent);
        setPremio(data.premio ?? '');
      })
      .catch(() => active && setStatus('erro'));
    return () => { active = false; };
  },[eventKey,code,fallbackEvent]);

  function updateField(field:keyof FormState,value:string) {
    const masks:Partial<Record<keyof FormState,(input:string)=>string>> = { telefone:maskPhone,cpf:maskCpf,cnpj:maskCnpj };
    setForm((current) => ({ ...current,[field]:masks[field] ? masks[field]!(value) : value }));
    setMessage('');
  }

  async function handleSubmit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setMessage('');
    try {
      const response = await fetch(`/api/eventos/${encodeURIComponent(eventKey)}/${encodeURIComponent(code)}`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form),
      });
      const data = await response.json() as { ok?:boolean; code?:string; message?:string };
      if (!response.ok) {
        setMessage(data.message ?? 'Não foi possível confirmar sua participação.');
        if (data.code === 'CODIGO_UTILIZADO') setStatus('utilizado');
        if (data.code === 'EVENTO_INATIVO') setStatus('inativo');
        return;
      }
      setComplete(true);
    } catch { setMessage('Falha de conexão. Verifique sua internet e tente novamente.'); }
    finally { setSubmitting(false); }
  }

  const unavailable = status !== 'disponivel';

  return (
    <main className="raffle-shell">
      <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
      <header className="raffle-header">
        <a className="brand" href="https://qualitycert.com.br" aria-label="Qualitycert">
          <Image className="brand-logo" src="/logo-qualitycert.png" alt="Qualitycert" width={221} height={50} priority />
        </a>
        <span className="secure-label"><i/> Inscrição segura</span>
      </header>
      <section className="raffle-layout">
        <aside className="event-intro">
          <p className="eyebrow">Sorteio exclusivo
             Bem-vindo ao evento</p>
          <h1>{displayEvent || fallbackEvent}</h1>
          {premio && <div className="prize-highlight"><span>Você está concorrendo a</span><strong>{premio}</strong></div>}
          <div className="ticket-card"><span className="ticket-label">Seu número da sorte</span><strong>{code}</strong><span className="ticket-event">{displayEvent || fallbackEvent}</span></div>
          <p className="privacy-note">Seus dados serão utilizados para validar sua participação, administrar o sorteio e entrar em contato em caso de premiação.</p>
        </aside>

        <section className={`form-card ${complete ? 'success-card' : ''}`} aria-labelledby="form-title">
          {complete ? (
            <div className="success-content" role="status">
              <span className="success-icon" aria-hidden="true">✓</span>
              <p className="eyebrow">Participação confirmada</p>
              <h2 id="form-title">Pronto, {form.nome.split(' ')[0]}!</h2>
              {premio && <div className="success-prize"><span>Prêmio do sorteio</span><strong>{premio}</strong></div>}
              <p>O número <strong>{code}</strong> está vinculado aos seus dados. Guarde a sua ficha e boa sorte no sorteio.</p>
            </div>
          ) : unavailable ? (
            <div className="status-content" role="status">
              <span className={`status-icon status-${status}`} aria-hidden="true">{status === 'carregando' ? '…' : status === 'utilizado' ? '✓' : '!'}</span>
              <p className="eyebrow">Validação do número</p>
              <h2 id="form-title">{status === 'carregando' ? 'Validando sua ficha…' : status === 'utilizado' ? 'Participação já confirmada' : status === 'inativo' ? 'Evento encerrado' : status === 'invalido' ? 'Número não encontrado' : 'Não foi possível validar'}</h2>
              <p>{status === 'utilizado' ? 'Este número já foi utilizado para uma participação.' : status === 'inativo' ? 'Este evento não está mais aceitando novas participações.' : status === 'invalido' ? 'Confira se você acessou o QR Code impresso na sua ficha.' : status === 'erro' ? 'Tente atualizar a página em alguns instantes.' : 'Aguarde só um momento.'}</p>
            </div>
          ) : (
            <>
              <div className="form-heading"><span className="step-badge">1</span><div><p className="eyebrow">Dados do participante</p><h2 id="form-title">Preencha seus dados e boa sorte!</h2></div></div>
              <form onSubmit={handleSubmit}>
                <label className="field field-full"><span>Nome completo <b>*</b></span><input required minLength={3} maxLength={160} autoComplete="name" value={form.nome} onChange={(e)=>updateField('nome',e.target.value)} placeholder="Preencha seu nome completo"/></label>
                <div className="field-row">
                  <label className="field"><span>Telefone <b>*</b></span><input required inputMode="tel" autoComplete="tel" value={form.telefone} onChange={(e)=>updateField('telefone',e.target.value)} placeholder="(00) 00000-0000"/></label>
                  <label className="field"><span>E-mail <b>*</b></span><input required type="email" maxLength={200} autoComplete="email" value={form.email} onChange={(e)=>updateField('email',e.target.value)} placeholder="voce@empresa.com.br"/></label>
                </div>
                <div className="field-row">
                  <label className="field"><span>CPF <b>*</b></span><input required inputMode="numeric" autoComplete="off" value={form.cpf} onChange={(e)=>updateField('cpf',e.target.value)} placeholder="000.000.000-00"/></label>
                  <label className="field field-full"><span>Contabilidade <b>*</b></span><input required minLength={2} maxLength={180} value={form.contabilidade} onChange={(e)=>updateField('contabilidade',e.target.value)} placeholder="Nome do escritório de contabilidade"/></label>
                </div>
                <label className="field field-full"><span>CNPJ <small>opcional</small></span><input inputMode="numeric" autoComplete="off" value={form.cnpj} onChange={(e)=>updateField('cnpj',e.target.value)} placeholder="00.000.000/0000-00"/></label>
                {message && <p className="form-error" role="alert">{message}</p>}
                <p className="required-note"><b>*</b> Campos obrigatórios</p>
                <button className="primary-button submit-button" type="submit" disabled={submitting}>{submitting ? 'Confirmando…' : 'Confirmar minha participação'} <span aria-hidden="true">→</span></button>
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
