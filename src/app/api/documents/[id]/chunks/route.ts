import { isSupabaseConfigured } from '@/config/aivora';
import { getSupabaseServer } from '@/lib/db/supabase/server';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: 'Vector store not connected.' }, { status: 503 });
  }

  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return Response.json({ ok: false, error: 'Invalid document ID.' }, { status: 400 });
  }

  try {
    const db = getSupabaseServer();

    const { data, error } = await db
      .from('document_chunks')
      .select('chunk_index, content, token_count')
      .eq('document_id', id)
      .order('chunk_index', { ascending: true })
      .limit(10);

    if (error) throw new Error(error.message);

    return Response.json({
      ok: true,
      chunks: (data ?? []).map((c) => ({
        index:      c.chunk_index as number,
        content:    c.content    as string,
        tokenCount: c.token_count as number | null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch chunks';
    console.error('[GET /api/documents/[id]/chunks]', msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
