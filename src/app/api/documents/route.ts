import { isSupabaseConfigured } from '@/config/aivora';
import { getSupabaseServer } from '@/lib/db/supabase/server';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { ok: false, error: 'Vector store not connected.' },
      { status: 503 },
    );
  }

  try {
    const db = getSupabaseServer();

    const { data: docs, error: docsError } = await db
      .from('documents')
      .select('id, title, source_type, file_name, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (docsError) throw new Error(docsError.message);

    const documents = docs ?? [];
    const docIds = documents.map((d) => d.id as string);

    // Single query to fetch all chunk document_ids then count per doc.
    const chunkCounts: Record<string, number> = {};
    if (docIds.length > 0) {
      const { data: chunkRows } = await db
        .from('document_chunks')
        .select('document_id')
        .in('document_id', docIds);

      for (const row of chunkRows ?? []) {
        const id = row.document_id as string;
        chunkCounts[id] = (chunkCounts[id] ?? 0) + 1;
      }
    }

    return Response.json({
      ok: true,
      documents: documents.map((d) => ({
        id: d.id as string,
        title: d.title as string,
        fileName: (d.file_name as string | null) ?? null,
        fileType: (d.source_type as string | null) ?? 'txt',
        chunksCount: chunkCounts[d.id as string] ?? 0,
        createdAt: d.created_at as string,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch documents';
    console.error('[GET /api/documents]', msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
