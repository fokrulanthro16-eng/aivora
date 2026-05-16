import { z } from 'zod';
import { insertDocument, insertChunks } from '@/lib/db/vector/vector-store';
import { chunkText } from '@/lib/documents/chunking/semantic-chunker';
import { parseTextContent } from '@/lib/documents/parsers/text-parser';
import { extractMetadata } from '@/lib/documents/metadata/extract-metadata';
import { embedBatch } from '@/lib/ai/embeddings/local-embedder';
import type { DocumentChunkInsert } from '@/lib/types/document';

export const runtime = 'nodejs';

const UploadBodySchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(10).max(500_000),
  source_type: z.enum(['pdf', 'docx', 'txt', 'html', 'markdown', 'url', 'manual']).optional(),
  source_url: z.string().url().optional(),
  file_name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = UploadBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed.', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { title, content, source_type, source_url, file_name, tags, metadata } = parsed.data;

  try {
    // Parse and normalize the raw text.
    const parsed_doc = parseTextContent(content);
    const doc_metadata = extractMetadata(parsed_doc.content, { title, file_name, source_url });

    // Persist the document row.
    const documentId = await insertDocument({
      title,
      source_type: source_type ?? null,
      source_url: source_url ?? null,
      file_name: file_name ?? null,
      tags: tags ?? [],
      metadata: { ...doc_metadata, ...(metadata ?? {}) },
    });

    // Chunk the text.
    const chunks = chunkText(parsed_doc.content);

    // Embed all chunks locally (no external API call).
    const embeddings = await embedBatch(chunks.map((c) => c.content));

    // Build insert rows.
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
      { success: true, documentId, chunkCount: chunkRows.length },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('[/api/documents/upload]', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
