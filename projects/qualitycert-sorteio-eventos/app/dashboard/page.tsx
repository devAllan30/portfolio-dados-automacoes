import { requirePageRole } from '@/lib/server-auth';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const session = await requirePageRole(['Admin', 'User']);
  return <DashboardClient isAdmin={session.tipo === 'Admin'} />;
}
