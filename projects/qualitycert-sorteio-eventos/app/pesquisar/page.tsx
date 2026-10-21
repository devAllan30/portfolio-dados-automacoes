import { requirePageRole } from '@/lib/server-auth';
import PesquisarGanhador from './PesquisarClient';

export default async function PesquisarPage() {
  const session = await requirePageRole(['Admin', 'User']);
  return <PesquisarGanhador isAdmin={session.tipo === 'Admin'} />;
}
