'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';

type FormState = { nome:string; telefone:string; email:string; cpf:string; contabilidade:string; cnpj:string };
type CodeStatus = 'carregando' | 'disponivel' | 'utilizado' | 'inativo' | 'invalido' | 'erro';
const initialForm: FormState = { nome:'', telefone:'', email:'', cpf:'', contabilidade:'', cnpj:'' };
const WHEEL_SUCCESS_URL = 'https://materiais.qualitycert.com.br/landing-page-ah-summit-2026-thank-you-voucher-certificados-roleta';

function decodedParam(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
function eventLabel(value: string) { return decodedParam(value).replace(/[-_]+/g, ' ').replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2'); }
function onlyDigits(value: string) { return value.replace(/\D/g, ''); }
function maskCpf(value: string) { return onlyDigits(value).slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'); }
function maskCnpj(value: string) { return onlyDigits(value).slice(0,14).replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2'); }
function maskPhone(value: string) {
  const number = onlyDigits(value).slice(0,11);
  if (number.length <= 10) return number.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d)/,'$1-$2');
  return number.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2');
}
function certificateLabel(value: number) { return `${value} ${value === 1 ? 'certificado' : 'certificados'}`; }

export default function CadastroRoleta() {
  const params = useParams<{ evento:string; codigo:string }>() ?? { evento:'', codigo:'' };
  const [form,setForm] = useState(initialForm);
  const [status,setStatus] = useState<CodeStatus>('carregando');
  const [displayEvent,setDisplayEvent] = useState('');
  const [certificateQuantity,setCertificateQuantity] = useState(0);
  const [awardRule,setAwardRule] = useState('');
  const [submitting,setSubmitting] = useState(false);
  const [message,setMessage] = useState('');
  const eventKey = useMemo(() => decodedParam(params.evento),[params.evento]);
  const code = useMemo(() => decodedParam(params.codigo),[params.codigo]);
  const fallbackEvent = useMemo(() => eventLabel(eventKey),[eventKey]);

  useEffect(() => {
    let active = true;
    fetch(`/api/eventos/${encodeURIComponent(eventKey)}/roleta/${encodeURIComponent(code)}`)
      .then(async (response) => {
        const data = await response.json() as { status:CodeStatus; eventoNome?:string; quantidadeCertificados?:number; regraPremiacao?:string|null };
        if (!active) return;
        setStatus(response.ok ? data.status : data.status === 'invalido' || data.status === 'inativo' ? data.status : 'erro');
        setDisplayEvent(data.eventoNome ?? fallbackEvent);
        setCertificateQuantity(Number(data.quantidadeCertificados ?? 0));
        setAwardRule(data.regraPremiacao ?? '');
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
      const response = await fetch(`/api/eventos/${encodeURIComponent(eventKey)}/roleta/${encodeURIComponent(code)}`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form),
      });
      const data = await response.json() as { ok?:boolean; code?:string; message?:string; quantidadeCertificados?:number };
      if (!response.ok) {
        setMessage(data.message ?? 'Não foi possível garantir seus certificados.');
        if (data.code === 'CODIGO_UTILIZADO') setStatus('utilizado');
        if (data.code === 'EVENTO_INATIVO') setStatus('inativo');
        return;
      }
      window.location.assign(WHEEL_SUCCESS_URL);
    } catch { setMessage('Falha de conexão. Verifique sua internet e tente novamente.'); }
    finally { setSubmitting(false); }
  }

  const unavailable = status !== 'disponivel';

  return (
    <main className="raffle-shell wheel-shell">
      <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
      <header className="raffle-header">
        <a className="brand" href="https://qualitycert.com.br" aria-label="Qualitycert"><Image className="brand-logo" src="/logo-qualitycert.png" alt="Qualitycert" width={221} height={50} priority /></a>
        <span className="secure-label"><i/> Cadastro seguro</span>
      </header>
      <section className="raffle-layout">
        <aside className="event-intro">
          {awardRule ? <p className="wheel-award-rule">{awardRule}</p> : <><p className="eyebrow">Benefício exclusivo<br/>Bem-vindo ao evento</p><h1>{displayEvent || fallbackEvent}</h1></>}
          {certificateQuantity > 0 && <div className="prize-highlight wheel-certificate-highlight"><span>Você acaba de ganhar</span><strong>{certificateLabel(certificateQuantity)}</strong></div>}
          <div className="ticket-card"><span className="ticket-label">Seu código de benefício</span><strong>{code}</strong><span className="ticket-event">Roleta · {displayEvent || fallbackEvent}</span></div>
          <p className="privacy-note">Preencha seus dados para validar  e garantir os certificados.</p>
        </aside>

        <section className="form-card" aria-labelledby="form-title">
          {unavailable ? (
            <div className="status-content" role="status">
              <span className={`status-icon status-${status}`} aria-hidden="true">{status === 'carregando' ? '…' : status === 'utilizado' ? '✓' : '!'}</span>
              <p className="eyebrow">Validação do código</p>
              <h2 id="form-title">{status === 'carregando' ? 'Validando seu benefício…' : status === 'utilizado' ? 'Certificados já garantidos' : status === 'inativo' ? 'Evento encerrado' : status === 'invalido' ? 'Código não encontrado' : 'Não foi possível validar'}</h2>
              <p>{status === 'utilizado' ? 'Este código já foi utilizado para garantir os certificados.' : status === 'inativo' ? 'Este evento não está mais aceitando novos cadastros.' : status === 'invalido' ? 'Confira se você acessou o QR Code correto da Roleta.' : status === 'erro' ? 'Tente atualizar a página em alguns instantes.' : 'Aguarde só um momento.'}</p>
            </div>
          ) : (
            <>
              <div className="form-heading"><span className="step-badge">1</span><div><p className="eyebrow">Dados do participante</p><h2 id="form-title">Preencha seus dados para garantir</h2></div></div>
              <form onSubmit={handleSubmit}>
                <label className="field field-full"><span>Nome completo <b>*</b></span><input required minLength={3} maxLength={160} autoComplete="name" value={form.nome} onChange={(e)=>updateField('nome',e.target.value)} placeholder="Preencha seu nome completo"/></label>
                <div className="field-row"><label className="field"><span>Telefone <b>*</b></span><input required inputMode="tel" autoComplete="tel" value={form.telefone} onChange={(e)=>updateField('telefone',e.target.value)} placeholder="(00) 00000-0000"/></label><label className="field"><span>E-mail <b>*</b></span><input required type="email" maxLength={200} autoComplete="email" value={form.email} onChange={(e)=>updateField('email',e.target.value)} placeholder="voce@empresa.com.br"/></label></div>
                <div className="field-row"><label className="field"><span>CPF <b>*</b></span><input required inputMode="numeric" autoComplete="off" value={form.cpf} onChange={(e)=>updateField('cpf',e.target.value)} placeholder="000.000.000-00"/></label><label className="field field-full"><span>Contabilidade <b>*</b></span><input required minLength={2} maxLength={180} value={form.contabilidade} onChange={(e)=>updateField('contabilidade',e.target.value)} placeholder="Nome do escritório de contabilidade"/></label></div>
                <label className="field field-full"><span>CNPJ <small>opcional</small></span><input inputMode="numeric" autoComplete="off" value={form.cnpj} onChange={(e)=>updateField('cnpj',e.target.value)} placeholder="00.000.000/0000-00"/></label>
                {message && <p className="form-error" role="alert">{message}</p>}
                <p className="required-note"><b>*</b> Campos obrigatórios</p>
                <button className="primary-button submit-button" type="submit" disabled={submitting}>{submitting ? 'Confirmando…' : 'Garantir meus certificados'} <span aria-hidden="true">→</span></button>
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
