import { isSupabaseConfigured } from '@/config/aivora';
import { getSupabaseServer } from '@/lib/db/supabase/server';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(message: string, status = 400): Response {
  console.error('[DELETE /api/documents/[id]]', message);
  return Response.json({ ok: false, error: message }, { status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isSupabaseConfigured()) {
    return err('Vector store not connected.', 503);
  }

  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return err('Invalid document ID.');
  }

  try {
    const db = getSupabaseServer();

    // Delete chunks explicitly before the document (safe even with CASCADE).
    const { error: chunksErr } = await db
      .from('document_chunks')
      .delete()
      .eq('document_id', id);
    if (chunksErr) throw new Error(chunksErr.message);

    const { error: docErr } = await db
      .from('documents')
      .delete()
      .eq('id', id);
    if (docErr) throw new Error(docErr.message);

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete failed';
    console.error('[DELETE /api/documents/[id]]', msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
