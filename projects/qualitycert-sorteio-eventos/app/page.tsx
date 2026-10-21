import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/server-auth';
import LoginForm from './LoginForm';

export default async function Home() {
  const session = await currentSession();
  if (session) redirect(session.tipo === 'Admin' ? '/gerenciadorEventos' : '/pesquisar');
  return <LoginForm />;
}
