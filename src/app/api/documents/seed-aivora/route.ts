import { readFileSync } from 'fs';
import { join } from 'path';
import { insertDocument, insertChunks } from '@/lib/db/vector/vector-store';
import { supabaseServer } from '@/lib/db/supabase/server';
import { chunkText } from '@/lib/documents/chunking/semantic-chunker';
import { embedBatch } from '@/lib/ai/embeddings/local-embedder';
import { isSupabaseConfigured } from '@/config/aivora';
import type { DocumentChunkInsert } from '@/lib/types/document';

export const runtime = 'nodejs';

const SEED_TITLE = 'Aivora Knowledge Base';
const KNOWLEDGE_FILE = join(process.cwd(), 'public', 'assets', 'aivora', 'aivora-knowledge.md');

export async function POST(): Promise<Response> {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: 'Supabase is not configured. Add the required environment variables.' },
      { status: 503 }
    );
  }

  // Check if already seeded.
  const { data: existing } = await supabaseServer
    .from('documents')
    .select('id')
    .eq('title', SEED_TITLE)
    .maybeSingle();

  if (existing) {
    return Response.json(
      { ok: true, alreadySeeded: true, documentTitle: SEED_TITLE, chunksInserted: 0 },
      { status: 200 }
    );
  }

  let rawContent: string;
  try {
    rawContent = readFileSync(KNOWLEDGE_FILE, 'utf-8');
  } catch {
    return Response.json(
      { error: 'Knowledge file not found at public/assets/aivora/aivora-knowledge.md' },
      { status: 500 }
    );
  }

  const documentId = await insertDocument({
    title: SEED_TITLE,
    source_type: 'markdown',
    source_url: null,
    file_name: 'aivora-knowledge.md',
    tags: ['aivora', 'system', 'knowledge'],
    metadata: { seeded: true },
  });

  const chunks = chunkText(rawContent);
  const embeddings = await embedBatch(chunks.map((c) => c.content));

  const chunkRows: DocumentChunkInsert[] = chunks.map((c, i) => ({
    document_id: documentId,
    chunk_index: c.index,
    content: c.content,
    embedding: embeddings[i] ?? null,
    token_count: c.tokenCount,
    page_number: null,
    metadata: {},
  }));

  await insertChunks(chunkRows);

  return Response.json(
    { ok: true, documentTitle: SEED_TITLE, chunksInserted: chunkRows.length },
    { status: 201 }
  );
}
