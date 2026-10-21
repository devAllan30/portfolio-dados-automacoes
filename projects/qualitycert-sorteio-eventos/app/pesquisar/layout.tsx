import { requirePageRole } from '@/lib/server-auth';

export default async function PesquisaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePageRole(['Admin', 'User']);
  return children;
}
