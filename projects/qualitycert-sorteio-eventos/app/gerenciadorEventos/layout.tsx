import { requirePageRole } from '@/lib/server-auth';

export default async function GerenciadorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePageRole(['Admin']);
  return children;
}
