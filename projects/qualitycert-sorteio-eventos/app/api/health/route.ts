import { getPool } from '@/db/mysql';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getPool().query('SELECT 1');
    return Response.json({ status: 'ok', database: 'connected' });
  } catch {
    return Response.json(
      { status: 'error', database: 'unavailable' },
      { status: 503 },
    );
  }
}
