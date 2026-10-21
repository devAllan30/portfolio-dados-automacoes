'use client';

import Image from 'next/image';
import { FormEvent, useState } from 'react';

export default function LoginForm() {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, senha }),
      });
      const data = await response.json() as { redirectTo?: string; message?: string };
      if (!response.ok || !data.redirectTo) {
        setMessage(data.message ?? 'Não foi possível entrar.');
        return;
      }
      window.location.assign(data.redirectTo);
    } catch {
      setMessage('Não foi possível conectar ao sistema.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <Image className="login-logo" src="/logo-qualitycert.png" alt="Qualitycert" width={221} height={50} priority />
        <div className="login-heading">
          <p className="eyebrow">Qualitycert Eventos</p>
          <h1>Acesso ao sistema</h1>
          <p>Informe seu usuário e senha para continuar.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label><span>Usuário</span><input required autoFocus autoComplete="username" maxLength={100} value={login} onChange={(event) => setLogin(event.target.value)} /></label>
          <label><span>Senha</span><input required type="password" autoComplete="current-password" maxLength={255} value={senha} onChange={(event) => setSenha(event.target.value)} /></label>
          {message && <p className="form-error" role="alert">{message}</p>}
          <button className="primary-button login-button" type="submit" disabled={submitting}>{submitting ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <small className="login-note">Acesso restrito a usuários autorizados.</small>
      </section>
    </main>
  );
}
