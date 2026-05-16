import { z } from 'zod';
import { insertDocument, insertChunks } from '@/lib/db/vector/vector-store';
import { chunkText } from '@/lib/documents/chunking/semantic-chunker';
import { parseTextContent } from '@/lib/documents/parsers/text-parser';
import { extractMetadata } from '@/lib/documents/metadata/extract-metadata';
import { embedBatch } from '@/lib/ai/embeddings/local-embedder';
import { parsePdf } from '@/lib/documents/parsers/pdf-parser';
import { parseDocx } from '@/lib/documents/parsers/docx-parser';
import type { DocumentChunkInsert, SourceType } from '@/lib/types/document';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXT: Record<string, SourceType> = {
  '.txt': 'txt',
  '.md': 'markdown',
  '.pdf': 'pdf',
  '.docx': 'docx',
};

const LegacyBodySchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(10).max(500_000),
  source_type: z.enum(['pdf', 'docx', 'txt', 'html', 'markdown', 'url', 'manual']).optional(),
  source_url: z.string().url().optional(),
  file_name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── Shared ingestion pipeline ─────────────────────────────────────────────────

async function ingestText(
  rawText: string,
  opts: {
    title: string;
    source_type: SourceType | null;
    source_url?: string | null;
    file_name?: string | null;
    tags?: string[];
    metadata?: Record<string, unknown>;
  },
): Promise<{ documentId: string; chunkCount: number }> {
  const parsedDoc = parseTextContent(rawText);
  const docMeta = extractMetadata(parsedDoc.content, {
    title: opts.title,
    file_name: opts.file_name ?? undefined,
    source_url: opts.source_url ?? undefined,
  });

  const documentId = await insertDocument({
    title: opts.title,
    source_type: opts.source_type,
    source_url: opts.source_url ?? null,
    file_name: opts.file_name ?? null,
    tags: opts.tags ?? [],
    metadata: { ...docMeta, ...(opts.metadata ?? {}) },
  });

  const chunks = chunkText(parsedDoc.content);
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
  return { documentId, chunkCount: chunkRows.length };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';

  // ── File upload (multipart/form-data) ─────────────────────────────────────
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: 'Invalid form data.' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return Response.json({ error: 'No file provided.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: 'File exceeds 10 MB limit.' }, { status: 413 });
    }

    const fileName = file.name;
    const dotIdx = fileName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '';

    if (!(ext in ALLOWED_EXT)) {
      return Response.json(
        { error: `Unsupported file type "${ext || '(none)'}". Allowed: .txt .md .pdf .docx` },
        { status: 415 },
      );
    }

    const sourceType = ALLOWED_EXT[ext]!;
    const titleFromForm = (form.get('title') as string | null)?.trim();
    const title = titleFromForm || (dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    let rawText: string;

    try {
      if (ext === '.pdf') {
        rawText = await parsePdf(buffer);
      } else if (ext === '.docx') {
        rawText = await parseDocx(buffer);
      } else {
        rawText = buffer.toString('utf-8');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction failed';
      return Response.json({ error: `Failed to parse file: ${msg}` }, { status: 422 });
    }

    if (rawText.trim().length < 10) {
      return Response.json(
        {
          error:
            'Extracted text is empty or too short. ' +
            'The file may be image-only, password-protected, or corrupt.',
        },
        { status: 422 },
      );
    }

    try {
      const { documentId, chunkCount } = await ingestText(rawText, {
        title,
        source_type: sourceType,
        file_name: fileName,
      });
      return Response.json(
        { success: true, documentId, chunkCount, fileType: sourceType, fileName },
        { status: 201 },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ingestion failed';
      console.error('[/api/documents/upload] file path:', msg);
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  // ── Legacy JSON path ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = LegacyBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed.', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { title, content, source_type, source_url, file_name, tags, metadata } = parsed.data;

  try {
    const { documentId, chunkCount } = await ingestText(content, {
      title,
      source_type: source_type ?? null,
      source_url: source_url ?? null,
      file_name: file_name ?? null,
      tags,
      metadata,
    });
    return Response.json({ success: true, documentId, chunkCount }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('[/api/documents/upload]', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
